#!/usr/bin/env python3
"""Generate a TELEMAC-MASCARET .dico from a v8p4 Reference Manual text dump.

Usage: gen_dico.py <manual.txt> <MODULE_LABEL> <out.dico>

The "Detail list of keywords" chapter of every v8p4 reference manual is produced
from the module's .dico, so it converts back into a .dico the extension's
parser reads. Section bounds: body title "1. Detail list of keywords" up to the
body title "2. List of keywords classified ..." (or end of file).
"""
import json
import re
import sys
import unicodedata

TYPE_MAP = {"real": "REAL", "integer": "INTEGER", "logical": "LOGICAL", "string": "STRING"}

HEADER_RE = re.compile(r"^ {0,2}1\.(\d+)\s{2,}(\S.*?)\s*$")
FIELD_RES = [
    ("type", re.compile(r"^\s*Type\s*:\s*(.*?)\s*$")),
    ("dim", re.compile(r"^\s*Dimension\s*:\s*(.*?)\s*$")),
    ("mnemo", re.compile(r"^\s*Mnemo\s*:?\s*(.*?)\s*$")),
    ("default", re.compile(r"^\s*DEFAULT VALUE\s*:\s*(.*?)\s*$")),
    ("french", re.compile(r"^\s*French keyword\s*:\s*(.*?)\s*$")),
    ("pathnode", re.compile(r"^\s*XML pathnode\s*:\s*(.*?)\s*$")),
]
NOISE_RE = re.compile(r"Chapter\s+1\.\s+Detail list of keywords")
PAGE_NUM_RE = re.compile(r"^\s*\d+\s*$")
# Page running header: indented section mark + keyword name + page number,
# e.g. "       1.37 FREE SURFACE FILE                              15"
RUNNING_HEADER_RE = re.compile(r"^\s*1\.\d+\s+\S.*?\s{3,}\d+\s*$")

# pdftotext splits small-caps product names: "T ELEMAC -3D" -> "TELEMAC-3D"
SMALLCAPS = ["TELEMAC", "TOMAWAC", "SISYPHE", "KHIONE", "GAIA", "STBTEL", "ARTEMIS",
             "WAQTEL", "POSTEL", "MASCARET", "COURLIS", "PARTEL", "DELWAQ", "TRACER"]
SMALLCAPS_RES = [(re.compile(r"\b" + w[0] + r" " + w[1:] + r"\b"), w) for w in SMALLCAPS]

HELP_PLACEHOLDER = "No help text is given for this keyword in the v8p4 reference manual."


def norm_quotes(s: str) -> str:
    return (s.replace("’", "'").replace("‘", "'")
             .replace("”", '"').replace("“", '"'))


def clean(s: str) -> str:
    s = unicodedata.normalize("NFC", norm_quotes(s))
    return re.sub(r"\s+", " ", s).strip()


def fix_smallcaps(s: str) -> str:
    for rx, word in SMALLCAPS_RES:
        s = rx.sub(word, s)
    return re.sub(r"\b(TELEMAC|POSTEL|STBTEL)\s*-\s*([23])\s*D\b", r"\1-\2D", s)


def join_help(lines):
    """Join wrapped help lines, healing words hyphenated across a line break
    ("repre-" + "sented" -> "represented")."""
    out = ""
    for ln in lines:
        if out and re.search(r"[A-Za-z]{2}-$", out) and re.match(r"[a-z]", ln):
            out = out[:-1] + ln
        else:
            out = f"{out} {ln}" if out else ln
    return out


def dico_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def find_bounds(lines):
    start = end = None
    for i, ln in enumerate(lines):
        if start is None:
            if re.match(r"^\s*1\.\s+Detail list of keywords\s*$", ln):
                start = i
        elif re.match(r"^\s*2\.\s+List of keywords classified", ln):
            end = i
            break
    if start is None:
        raise SystemExit("detail section not found")
    return start, (end if end is not None else len(lines))


def parse(text: str):
    lines = text.replace("\x0c", "\n").split("\n")
    start, end = find_bounds(lines)
    entries, cur, last_field = [], None, None
    for ln in lines[start + 1:end]:
        if NOISE_RE.search(ln) or PAGE_NUM_RE.match(ln) or RUNNING_HEADER_RE.match(ln):
            continue
        m = HEADER_RE.match(ln)
        if m:
            if cur:
                entries.append(cur)
            cur = {"num": int(m.group(1)), "name": clean(m.group(2)), "help": [], "related": []}
            last_field = "name"
            continue
        # Tomawac lists cross-references under a "Related keywords" heading,
        # one keyword per line.
        if cur is not None and ln.strip() == "Related keywords":
            last_field = "related"
            continue
        if cur is not None and last_field == "related" and ln.strip():
            cur["related"].append(clean(ln))
            continue
        if cur is None or not ln.strip():
            continue
        hit = False
        for key, rx in FIELD_RES:
            fm = rx.match(ln)
            if fm:
                cur[key] = clean(fm.group(1))
                last_field = key
                hit = True
                break
        if hit:
            continue
        # A long keyword name wrapping before the field block.
        if "type" not in cur:
            cur["name"] = clean(cur["name"] + " " + ln)
            continue
        # A field value wrapping onto the next line sits at the value column,
        # well right of the help-text margin.
        if not cur["help"] and last_field in ("french", "mnemo", "default", "pathnode") and indent_of(ln) >= 15:
            cur[last_field] = clean(cur[last_field] + " " + ln)
            continue
        cur["help"].append(ln.strip())
        last_field = "help"
    if cur:
        entries.append(cur)
    return entries


CH2_NOISE_RE = re.compile(r"Chapter\s+2\.\s+List of keywords|^\s*to type\s*$")
L1_RE = re.compile(r"^ {0,2}2\.(\d+)\s{2,}(\S.*?)\s*$")
L2_RE = re.compile(r"^ {0,2}2\.(\d+)\.(\d+)\s{2,}(\S.*?)\s*$")
CH2_RUNNING_RE = re.compile(r"^\s*2\.\d+(\.\d+)*\s+\S.*?\s{3,}\d+\s*$")


def classify(text: str, names: set):
    """Map keyword name -> [level1, level2, level3] from chapter 2
    ("List of keywords classified according to type"). Numbered headings give
    levels 1 and 2; unnumbered lines that are not keyword names are level-3
    subheadings."""
    lines = text.replace("\x0c", "\n").split("\n")
    _, start = find_bounds(lines)
    end = next((i for i, l in enumerate(lines[start:], start)
                if re.match(r"^\s*3\.\s+Glossary", l)), len(lines))
    cats, l1, l2, l3 = {}, "", "", ""
    body = [l for l in lines[start + 1:end]
            if l.strip() and not CH2_NOISE_RE.search(l) and not PAGE_NUM_RE.match(l)
            and not CH2_RUNNING_RE.match(l)]
    i = 0
    while i < len(body):
        ln = body[i]
        m2 = L2_RE.match(ln)
        m1 = None if m2 else L1_RE.match(ln)
        if m2:
            l2, l3 = clean(m2.group(3)), ""
        elif m1:
            l1, l2, l3 = clean(m1.group(2)), "", ""
        else:
            name = clean(ln)
            joined = clean(ln + " " + body[i + 1]) if i + 1 < len(body) else None
            if name in names:
                cats.setdefault(name, [l1, l2, l3])
            elif joined in names:  # keyword name wrapped onto two lines
                cats.setdefault(joined, [l1, l2, l3])
                i += 1
            else:
                l3 = name
        i += 1
    return cats


def format_default(raw: str, typ: str):
    v = norm_quotes(raw).strip()
    if v in ('"', "''", '""'):
        return "''"
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
        v = v[1:-1]
    if v.upper() == "MANDATORY":
        return "MANDATORY"
    if typ == "STRING":
        return dico_str(v)
    return v


def to_dico(entries, label: str, cats=None):
    out = ["&DYN",
           f"/ {label} dictionary reconstructed from the TELEMAC-MASCARET v8p4 Reference Manual.",
           "/ Keyword names and descriptions (c) TELEMAC-MASCARET Consortium, from the",
           "/ open-source TELEMAC-MASCARET system, distributed under the GNU General Public",
           "/ License v3 (see COPYING in this folder). Generated for the VS Code extension",
           "/ TELEMAC-MASCARET Language Support.",
           "/"]
    stats = {"kept": 0, "skipped": [], "placeholder_help": 0, "untyped": [], "unclassified": []}
    for idx, e in enumerate(entries, start=1):
        typ = TYPE_MAP.get(e.get("type", "").lower())
        if not e.get("name") or typ is None:
            stats["skipped"].append((e.get("name"), e.get("type")))
            continue
        try:
            taille = int(re.match(r"-?\d+", e.get("dim", "1")).group(0))
        except (AttributeError, ValueError):
            taille = 1
        help_txt = fix_smallcaps(clean(join_help(e["help"])))
        if not help_txt or help_txt.upper().startswith("TODO"):
            help_txt = HELP_PLACEHOLDER
            stats["placeholder_help"] += 1
        if e.get("related"):
            refs = ", ".join(f"`{r}`" for r in e["related"])
            help_txt = f"{help_txt} Related keywords: {refs}."
            stats["related"] = stats.get("related", 0) + 1
        out.append(f"NOM = {dico_str(e.get('french') or e['name'])}")
        out.append(f"NOM1 = {dico_str(e['name'])}")
        out.append(f"TYPE = {typ}")
        out.append(f"INDEX = {idx}")
        out.append(f"TAILLE = {taille}")
        if e.get("mnemo"):
            out.append(f"MNEMO = {dico_str(e['mnemo'])}")
        if e.get("default"):
            out.append(f"DEFAUT1 = {format_default(e['default'], typ)}")
        cat = (cats or {}).get(e["name"])
        if cat is None:
            cat = [label, "", ""]
            stats["unclassified"].append(e["name"])
        rub = ";".join(dico_str(c) for c in cat)
        out.append(f"RUBRIQUE = {rub}")
        out.append(f"RUBRIQUE1 = {rub}")
        out.append("NIVEAU = 1")
        out.append(f"AIDE1 = {dico_str(help_txt)}")
        out.append("/")
        stats["kept"] += 1
    return "\n".join(out) + "\n", stats


if __name__ == "__main__":
    src, label, dest = sys.argv[1], sys.argv[2], sys.argv[3]
    text = open(src, encoding="utf-8", errors="replace").read()
    entries = parse(text)
    cats = classify(text, {e["name"] for e in entries})
    dico, stats = to_dico(entries, label, cats)
    open(dest, "w", encoding="utf-8").write(dico)
    print(json.dumps({"module": label, "headers": len(entries), "kept": stats["kept"],
                      "skipped": stats["skipped"][:5], "n_skipped": len(stats["skipped"]),
                      "placeholder_help": stats["placeholder_help"], "related": stats.get("related", 0), "unclassified": stats["unclassified"][:6], "n_unclassified": len(stats["unclassified"]),
                      "max_num": max((e["num"] for e in entries), default=0)}))
