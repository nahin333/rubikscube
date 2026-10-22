-- Presentation-only conversion of REPORT.md into a two-column manuscript.
local stringify = pandoc.utils.stringify
local raw = function(s) return pandoc.RawBlock('latex', s) end
local table_index = 0
local figure_index = 0
local skipping_manual_references = false
local citation_keys = {
  ['1'] = 'korf1997',
  ['2'] = 'kociemba_coordinates',
  ['3'] = 'kociemba_pruning',
  ['4'] = 'cubejs',
  ['5'] = 'mcaleer2018',
  ['6'] = 'fridrich',
  ['7'] = 'demaine2011',
  ['8'] = 'rokicki_gods_number',
}

function Str(el)
  local before, number, after = el.text:match('^(.-)%[(%d+)%](.*)$')
  if not number or not citation_keys[number] then return el end
  local out = {}
  if before ~= '' then table.insert(out, pandoc.Str(before)) end
  table.insert(out, pandoc.RawInline('latex', '\\cite{' .. citation_keys[number] .. '}'))
  if after ~= '' then table.insert(out, pandoc.Str(after)) end
  return out
end

function Link(el)
  if not el.target:match('^https?://') and not el.target:match('^#') then
    local path = el.target
    if path:match('^%.%./') then path = path:sub(4)
    else path = 'research/' .. path end
    el.target = 'https://github.com/nahin333/rubikscube/blob/main/' .. path
  end
  return el
end

function Math(el)
  if el.mathtype ~= 'DisplayMath' then return el end
  local tag = el.text:match('\\tag{(%d+)}')
  local equations = {
    [1] = [[\begin{aligned}T(s_0,\pi)&=s_\star,\\L^\star(s_0)&=\min_{\pi:T(s_0,\pi)=s_\star}|\pi|.\end{aligned}]],
    [2] = [[\begin{gathered}\sum_{i=0}^{7}o_{c,i}\equiv0\pmod3,\quad\sum_{i=0}^{11}o_{e,i}\equiv0\pmod2,\\\operatorname{parity}(p_c)=\operatorname{parity}(p_e).\end{gathered}]],
    [3] = [[\begin{aligned}|V|&=\frac{8!\,3^7\,12!\,2^{11}}{2}\\&=43,252,003,274,489,856,000.\end{aligned}]],
    [5] = [[\begin{gathered}n_c=3^7=2187,\quad n_e=2^{11}=2048,\\n_s=\binom{12}{4}=495.\end{gathered}]],
    [9] = [[\begin{aligned}M_D&=2187\cdot495+2048\cdot495\\&\quad+2(40320\cdot24)\\&=4,031,685\ \text{bytes}.\end{aligned}]],
    [10] = [[\begin{aligned}M_T&=2[18(2187+2048+495)\\&\quad+10(40320+40320+24)]\\&=1,783,560\ \text{bytes}.\end{aligned}]],
    [11] = [[\begin{gathered}w_j=\sum_{k=0}^{4}c_{5j+k}\,2^{3k},\\c_i\in\{0,\ldots,5\}.\end{gathered}]],
  }
  if tag and equations[tonumber(tag)] then
    el.text = equations[tonumber(tag)] .. '\\tag{' .. tag .. '}'
  end
  return el
end

function CodeBlock(el)
  if el.text:match('^Input: valid state') then
    return raw([[\begin{figure}[t]
\hrule\vspace{5pt}
\textbf{Algorithm 1.} COVE-3 budgeted two-phase search
\vspace{4pt}
\begin{Verbatim}[fontsize=\footnotesize,breaklines=true,breakanywhere=true]
Input: state s0; transition/distance tables
       candidate and global work budgets
Output: verified moves, or explicit failure
for d1 = h1(s0), ..., 12:
  enumerate phase-1 paths with h1 pruning
  for each endpoint sH in subgroup H:
    reset candidate's phase-2 node counter
    for d2 = h2(sH), ..., 18:
      search with h2 and H-preserving moves
      if a completion is found:
        join phase-1 and phase-2 paths
        verify cubie and sticker replay
        return only if both checks pass
      if candidate budget is exceeded:
        break; try another endpoint
    enforce global budgets throughout
return explicit search failure
\end{Verbatim}
\vspace{3pt}\hrule
\end{figure}]])
  end
  return {}
end

function Table(el)
  table_index = table_index + 1
  local tables = {
[[\begin{table}[H]
\caption{Paired evaluation on 200 states. Lower latency and fewer moves are preferable; both configurations pass replay on all cases.}
\centering\small
\begin{tabularx}{\columnwidth}{@{}Lrr@{}}
\toprule Metric & cubejs & COVE-3 \\\midrule
Verified completions & 200/200 & 200/200 \\
Median latency (ms) & 34.047 & \textbf{5.965} \\
P95 latency (ms) & 203.485 & \textbf{28.918} \\
Maximum latency (ms) & 1062.317 & \textbf{88.875} \\
Initialization (ms) & 1265.989 & \textbf{538.343} \\
Mean moves & \textbf{21.71} & 22.77 \\
Maximum moves & \textbf{22} & 26 \\\bottomrule
\end{tabularx}
\end{table}]],
[[\begin{table*}[t]
\caption{Bidirectional BFS before and after the combined changes. Latencies are medians of three runs, not component-wise ablations.}
\centering\small
\begin{tabularx}{\textwidth}{@{}Lrrr@{}}
\toprule Instance & Entries: before $\to$ after & Latency (ms): before $\to$ after & Optimal length \\\midrule
2$\times$2, eight-turn scramble & 770 $\to$ 585 & 20 $\to$ 13 & 6 \\
3$\times$3, eight-turn scramble & 93,482 $\to$ 58,251 & 109 $\to$ 124 & 8 \\
3$\times$3, ten-turn scramble & 1,243,298 $\to$ 775,168 & 1957 $\to$ 1590 & 10 \\\bottomrule
\end{tabularx}
\end{table*}]],
[[\begin{table*}[t]
\caption{Verification evidence. The tests cover different populations and should not be pooled as independent samples.}
\centering\small
\begin{tabularx}{\textwidth}{@{}p{0.23\textwidth}Lp{0.25\textwidth}@{}}
\toprule Evaluation & Coverage & Recorded outcome \\\midrule
Exact-search regression & 2,013 searches; shallow independent BFS oracle and deeper cross-checks & Passed \\
Practical regression & 219 solved, single-turn, and seeded long-scramble cases & Passed replay and phase checks \\
Representation consistency & 1,000 cubie/sticker transition comparisons & Matched \\
Permutation indexing & All 40,320 eight-piece rank/unrank pairs & Matched \\
Paired practical experiment & 200 shared states, two solvers & All outputs verified \\
Chromium integration & Desktop/mobile viewport, playback, sample photos, invalid input, cancellation, failure handling & Passed locally and deployed \\\bottomrule
\end{tabularx}
\end{table*}]],
  }
  return raw(tables[table_index])
end

function Pandoc(doc)
  local out = {}
  for _, block in ipairs(doc.blocks) do
    local text = stringify(block)
    if block.t == 'Header' and text == 'References' then
      table.insert(out, raw('\\bibliographystyle{ieeenat_fullname}\n\\bibliography{references}'))
      skipping_manual_references = true
    elseif skipping_manual_references and block.t ~= 'Header' then
      -- The Markdown bibliography remains readable on GitHub; BibTeX
      -- supplies the CVPR-formatted bibliography in the PDF.
    elseif block.t == 'Header' and block.level == 1 then
      -- The template supplies the full-width paper title.
    elseif block.t == 'Para' and (text:match('^Rubik’s Graph Lab') or text:match('^Typeset PDF') or text:match('^Project page')) then
    elseif block.t == 'Header' and text == 'Abstract' then
      table.insert(out, raw('\\begin{abstract}'))
    elseif block.t == 'Para' and text:match('^Keywords:') then
      table.insert(out, raw('\\end{abstract}'))
    elseif block.t == 'Para' and (text:match('^Table %d') or text:match('^Algorithm 1')) then
    elseif block.t == 'Figure' or (block.t == 'Para' and block.content[1] and block.content[1].t == 'Image') then
      figure_index = figure_index + 1
      if figure_index == 1 then
        table.insert(out, raw([[\begin{figure*}[t]
\centering\includegraphics[width=\textwidth]{figures/system-pipeline.pdf}
\caption{System pipeline. A browser worker performs state validation, bounded two-phase search, and output verification. Photo input is manually corrected before conversion to a symbolic state and is not evaluated as autonomous computer vision.}
\label{fig:pipeline}
\end{figure*}]]))
      else
        table.insert(out, raw([[\begin{figure*}[t]
\centering\includegraphics[width=\textwidth]{figures/solver-comparison.pdf}
\caption{All 200 paired observations. (a) Points below the diagonal favor COVE-3 in latency; axes are logarithmic. (b) Empirical cumulative latency distributions. (c) Extra moves from COVE-3. COVE-3 is faster on 197 cases and produces longer, equal-length, and shorter paths on 133, 58, and 9 cases. These are descriptive summaries, not significance tests.}
\label{fig:comparison}
\end{figure*}]]))
      end
    elseif block.t == 'Para' and text:match('^Figure %d') then
    elseif block.t == 'Header' then
      block.level = block.level - 1
      local title = text:gsub('^%d+%.%d+%.?%s*', ''):gsub('^%d+%.%s*', '')
      block.content = pandoc.Inlines({pandoc.Str(title)})
      table.insert(out, block)
    elseif block.t ~= 'RawBlock' or block.format ~= 'html' then
      table.insert(out, block)
    end
  end
  doc.blocks = out
  return doc
end
