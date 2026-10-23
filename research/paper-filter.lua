-- Presentation-only conversion; table values come from the Markdown source.
local stringify = pandoc.utils.stringify
local raw = function(s) return pandoc.RawBlock('latex', s) end
local table_index, figure_index = 0, 0
local citation_keys = {'korf1997', 'kociemba_coordinates', 'kociemba_pruning', 'cubejs', 'mcaleer2018', 'fridrich', 'demaine2011', 'rokicki_gods_number', 'felner2012', 'sturtevant2017'}

function Str(el)
  local before, number, after = el.text:match('^(.-)%[(%d+)%](.*)$')
  local key = number and citation_keys[tonumber(number)]
  if not key then return el end
  local out = {}
  if before ~= '' then table.insert(out, pandoc.Str(before)) end
  table.insert(out, pandoc.RawInline('latex', '\\cite{' .. key .. '}'))
  if after ~= '' then table.insert(out, pandoc.Str(after)) end
  return out
end

function Link(el)
  if not el.target:match('^https?://') and not el.target:match('^#') then
    local path = el.target
    if path:match('^%.%./') then path = path:sub(4) else path = 'research/' .. path end
    el.target = 'https://github.com/nahin333/rubikscube/blob/main/' .. path
  end
  return el
end

function CodeBlock(el)
  if not el.text:match('^Input: phase%-2') then return el end
  return raw('\\begin{figure}[t]\n\\hrule\\vspace{5pt}\n\\textbf{Algorithm 1.} Budget-preserving phase-2 expansion\n\\vspace{4pt}\n\\begin{Verbatim}[fontsize=\\footnotesize,breaklines=true,breakanywhere=true]\n' .. el.text .. '\n\\end{Verbatim}\n\\vspace{3pt}\\hrule\n\\end{figure}')
end

function Table(el)
  table_index = table_index + 1
  local captions = {
    'Complexity relative to the actual scalar baseline. Both methods retain exponential worst-case search; compiled expansion avoids constructing rejected children.',
    'Primary matched-output evaluation: 500 states and five repetitions per configuration. Statistics use per-instance medians; all move sequences and logical counts are identical.',
    'Persistent numeric storage. The flat footprint is calculated, not a measured flat-solver latency or peak heap.',
    'Separate cubejs comparison on 200 shared scrambles. One timing per state; solution-quality targets differ.',
    'Verification evidence. Counts concern different checks and should not be pooled as independent samples.',
  }
  local layouts = {
    {'table*', '\\textwidth', '@{}p{0.20\\textwidth}LLp{0.22\\textwidth}@{}'},
    {'table*', '\\textwidth', '@{}Lrrr@{}'},
    {'table', '\\columnwidth', '@{}Lrr@{}'},
    {'table', '\\columnwidth', '@{}Lrr@{}'},
    {'table*', '\\textwidth', '@{}p{0.23\\textwidth}Lp{0.22\\textwidth}@{}'},
  }
  local layout = assert(layouts[table_index], 'Unexpected manuscript table')
  local function row_latex(row)
    local cells = {}
    for _, cell in ipairs(row.cells) do
      local content = pandoc.write(pandoc.Pandoc(cell.contents), 'latex'):gsub('%s+$', ''):gsub('\n\n', ' ')
      table.insert(cells, content)
    end
    return table.concat(cells, ' & ') .. ' \\\\'
  end
  local rows = {}
  for _, row in ipairs(el.head.rows) do table.insert(rows, row_latex(row)) end
  table.insert(rows, '\\midrule')
  for _, body in ipairs(el.bodies) do
    for _, row in ipairs(body.head) do table.insert(rows, row_latex(row)) end
    for _, row in ipairs(body.body) do table.insert(rows, row_latex(row)) end
  end
  local placement = layout[1] == 'table*' and 't' or 'H'
  return raw('\\begin{' .. layout[1] .. '}[' .. placement .. ']\n\\caption{' .. captions[table_index] .. '}\n\\centering\\small\n\\begin{tabularx}{' .. layout[2] .. '}{' .. layout[3] .. '}\n\\toprule\n' .. table.concat(rows, '\n') .. '\n\\bottomrule\n\\end{tabularx}\n\\end{' .. layout[1] .. '}')
end

function Pandoc(doc)
  local out, references = {}, false
  local figures = {
    {'system-pipeline', 'Browser execution. The first scalar result is posted before contour compilation; later solves use compiled tables. Photo-derived stickers require manual correction and are not an autonomous vision benchmark.'},
    {'contour-ablation', 'Primary matched-output experiment. (a) Each point is one state\'s median of five timings. (b) Empirical latency distributions for all three configurations. (c) Persistent typed-array storage; the flat footprint is calculated. Outputs and logical counts are identical across configurations.'},
    {'solver-comparison', 'Separate external cubejs comparison: paired latency, latency distributions, and extra moves. Different length targets prevent an equal-quality speedup claim.'},
  }
  for _, block in ipairs(doc.blocks) do
    local text = stringify(block)
    if block.t == 'Header' and text == 'References' then
      table.insert(out, raw('\\bibliographystyle{ieeenat_fullname}\n\\bibliography{references}'))
      references = true
    elseif references then
      -- Keep the readable manual bibliography only in the GitHub manuscript.
    elseif block.t == 'Header' and block.level == 1 then
    elseif block.t == 'Para' and text:match('^Typeset PDF') then
    elseif block.t == 'Header' and text == 'Abstract' then
      table.insert(out, raw('\\begin{abstract}'))
    elseif block.t == 'Para' and text:match('^Keywords:') then
      table.insert(out, raw('\\end{abstract}'))
    elseif block.t == 'Para' and (text:match('^Table %d') or text:match('^Algorithm %d') or text:match('^Figure %d')) then
    elseif block.t == 'Figure' or (block.t == 'Para' and block.content[1] and block.content[1].t == 'Image') then
      figure_index = figure_index + 1
      local f = assert(figures[figure_index], 'Unexpected manuscript figure')
      table.insert(out, raw('\\begin{figure*}[t]\n\\centering\\includegraphics[width=\\textwidth]{figures/' .. f[1] .. '.pdf}\n\\caption{' .. f[2] .. '}\n\\label{fig:' .. f[1] .. '}\n\\end{figure*}'))
    elseif block.t == 'Header' then
      block.level = block.level - 1
      block.content = pandoc.Inlines({pandoc.Str(text:gsub('^%d+%.%d+%.?%s*', ''):gsub('^%d+%.%s*', ''))})
      table.insert(out, block)
    elseif block.t ~= 'RawBlock' or block.format ~= 'html' then
      table.insert(out, block)
    end
  end
  doc.blocks = out
  return doc
end
