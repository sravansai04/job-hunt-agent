#!/bin/sh
# Local alternative to Overleaf: compile a .tex to PDF with pdflatex (MacTeX / TeX Live).
# Usage: setup/compile_resume.sh resume/jobs/2026-01-01_company_role.tex
set -e
[ -f "$1" ] || { echo "usage: $0 file.tex"; exit 1; }
n=$(grep -c 'end{document}' "$1"); [ "$n" = 1 ] || { echo "expected exactly one \\end{document}, found $n"; exit 1; }
d=$(dirname "$1"); pdflatex -interaction=nonstopmode -halt-on-error -output-directory "$d" "$1" >/dev/null && rm -f "$d"/*.aux "$d"/*.log "$d"/*.out
echo "built ${1%.tex}.pdf"
