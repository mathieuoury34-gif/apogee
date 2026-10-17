#!/usr/bin/env python3
"""Liste les textes $t("…") du code qui n'ont pas de traduction dans src/i18n-en.ts. Usage : python3 tools/missing-en.py"""
import re, glob
en = open('src/i18n-en.ts', encoding='utf8').read()
keys = set(re.findall(r'^\s*"((?:[^"\\]|\\.)*)"\s*:', en, re.M))
keys |= set(re.findall(r"^\s*'((?:[^'\\]|\\.)*)'\s*:", en, re.M))
miss = []
for f in glob.glob('src/**/*.ts*', recursive=True):
    if f.endswith('i18n-en.ts') or 'help-content' in f: continue
    t = open(f, encoding='utf8').read()
    for m in re.finditer(r'\$t\(\s*(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\')', t):
        s = (m.group(1) or m.group(2) or '').replace('\\"', '"').replace("\\'", "'")
        if s and s not in keys: miss.append((f, s))
for f, s in miss: print(f'{f}: {s}')
print(len(miss), 'manquants')
