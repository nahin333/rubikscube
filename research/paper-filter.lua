-- Presentation-only conversion; table values come from the Markdown source.
local stringify = pandoc.utils.stringify
local raw = function(s) return pandoc.RawBlock('latex', s) end
local table_index, figure_index = 0, 0
local citation_keys = {
  'korf1997', 'kociemba_coordinates', 'kociemba_pruning', 'cubejs',
  'mcaleer2018', 'fridrich', 'demaine2011', 'rokicki_gods_number',
  'felner2012', 'sturtevant2017', 'akagi2010', 'lammich2015',
  'goldenberg2014', 'breyer2010', 'sethian1996',
}

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
  if el.text:match('^Input: phase%-2') then
    return raw('\\begin{figure}[t]\n\\hrule\\vspace{5pt}\n\\textbf{Algorithm 1.} Budget-preserving Horizon-1 phase-2 expansion\n\\vspace{4pt}\n\\begin{Verbatim}[fontsize=\\footnotesize,breaklines=true,breakanywhere=true]\n' .. el.text .. '\n\\end{Verbatim}\n\\vspace{3pt}\\hrule\n\\end{figure}')
  end
  if el.text:match('^Input: potential%-free') then
    return raw('\\begin{figure}[t]\n\\hrule\\vspace{5pt}\n\\textbf{Algorithm 2.} Potential-free coboundary Horizon-2 expansion with three-tier accounting\n\\vspace{4pt}\n\\begin{Verbatim}[fontsize=\\footnotesize,breaklines=true,breakanywhere=true]\n' .. el.text .. '\n\\end{Verbatim}\n\\vspace{3pt}\\hrule\n\\end{figure}')
  end
  if el.text:match('^Input: holonomy%-compiled') then
    return raw('\\begin{figure}[t]\n\\hrule\\vspace{5pt}\n\\textbf{Algorithm 3.} Holonomy-Guided Bifurcated Eikonal Wavefront Search (HBEW)\n\\vspace{4pt}\n\\begin{Verbatim}[fontsize=\\footnotesize,breaklines=true,breakanywhere=true]\n' .. el.text .. '\n\\end{Verbatim}\n\\vspace{3pt}\\hrule\n\\end{figure}')
  end
  return el
end

function Table(el)
  table_index = table_index + 1
  local captions = {
    'Complexity relative to the frozen scalar baseline across 1-step contour, potential-free dual-horizon, and HBEW holonomy search. Worst-case search remains exponential in depth.',
    'Stage-1 matched-output evaluation: 500 states and five repetitions per configuration. Statistics use per-instance medians; all move sequences and logical counts are identical.',
    'Persistent numeric storage across scalar, coboundary H2-only, 1-step contour, potential-free/32-bit dual-horizon, and HBEW holonomy representations.',
    'Archived Stage-2 cubejs 1.3.2 comparison on 200 shared scrambles. One timing per state; solution-length targets differ.',
    'Verification evidence across Stage-1 contour, Stage-2 dual-horizon, and Stage-3 HBEW holonomy suites. Counts concern distinct checks and are not pooled.',
    'Follow-up negative results on 500 separate states, five repetitions. Each candidate uses its own contemporaneous contour baseline.',
    'Held-out 500-state evaluation (seed 0xd48a63, five repetitions) and cache-aware pairwise ablations of potential-free dual-horizon compilation at identical outputs and logical counts.',
    'Stage-3 held-out 500-state evaluation (seed 0x5e71a9, five repetitions) and five-mode component ablations of Holonomy-Guided Bifurcated Eikonal Wavefront Search (HBEW).',
    'Stage-3 head-to-head comparison against cubejs 1.3.2 and COVE-3 Dual-Horizon on 200 shared scrambles (seed 0x74bc39, three interleaved repetitions per solver).',
  }
  local layouts = {
    {'table*', '\\textwidth', '@{}p{0.23\\textwidth}LLp{0.28\\textwidth}@{}'},
    {'table*', '\\textwidth', '@{}Lrrr@{}'},
    {'table', '\\columnwidth', '@{}Lrr@{}'},
    {'table*', '\\textwidth', '@{}Lrrr@{}'},
    {'table*', '\\textwidth', '@{}p{0.24\\textwidth}Lp{0.22\\textwidth}@{}'},
    {'table*', '\\textwidth', '@{}Lrrr@{}'},
    {'table*', '\\textwidth', '@{}Lrrrrr@{}'},
    {'table*', '\\textwidth', '@{}Lrrrrr@{}'},
    {'table*', '\\textwidth', '@{}Lrrrrr@{}'},
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
    {'system-pipeline', 'Browser execution. The first scalar result is posted before worker compilation; later solves use potential-free clique syndromes and the unified coboundary Horizon-2 dictionary. Photo-derived stickers require manual correction and are not an autonomous vision benchmark.'},
    {'contour-ablation', 'Stage-1 matched-output contour study. (a) Per-state medians of five timings. (b) Empirical latency distributions for scalar, dictionary+scalar, and 1-step contour configurations. (c) Stage-1 persistent typed-array storage.'},
    {'solver-comparison', 'Separate external cubejs comparison: paired latency, latency distributions, and extra moves. Different length targets prevent an equal-quality speedup claim.'},
    {'research-extensions', 'Follow-up negative results: per-instance latency ratios relative to the concurrently interleaved contour baseline. Ratios above one indicate slower execution.'},
    {'dual-horizon', 'Held-out 500-state evaluation of potential-free dual-horizon compilation (seed 0xd48a63, five repetitions). (a) Per-state median latency against pinned COVE-3 contours (499/500 faster). (b) Empirical distributions for scalar, COVE-3 contour, and potential-free dual-horizon solvers. (c) Generated visits and persistent table footprints across the five-stage ablation ladder.'},
    {'holonomy-wavefront', 'Stage-3 Holonomy-Guided Bifurcated Eikonal Wavefront Search (HBEW) evaluation. (a) Held-out 500-state solution-length distributions (seed 0x5e71a9): HBEW lowers mean length from 22.94 to 20.58 moves with 500/500 states at or below 22 moves. (b) External 200-scramble latency CDFs against cubejs 1.3.2 (seed 0x74bc39): HBEW Default runs 6.54x faster at the median (15.7x at P95) while averaging 1.25 fewer moves. (c) Mean harvested subgroup-H lifts and solve latency across component ablations.'},
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
    elseif block.t == 'Para' and (text:match('^Table %d+%.') or text:match('^Algorithm %d+%.') or text:match('^Figure %d+%.')) then
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
