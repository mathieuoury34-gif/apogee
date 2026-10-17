#!/usr/bin/env python3
"""Ajoute des entrées FR→EN à la fin de src/i18n-en.ts. Usage : python3 tools/add-en.py fichier.json  ({"texte fr": "english"})"""
import json, sys
add = json.load(open(sys.argv[1], encoding='utf8'))
p = 'src/i18n-en.ts'
s = open(p, encoding='utf8').read()
body = ''.join(f'  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)},\n' for k, v in add.items() if json.dumps(k, ensure_ascii=False) + ':' not in s)
i = s.rindex('};')
open(p, 'w', encoding='utf8').write(s[:i] + body + s[i:])
print(len(add), 'entrées traitées')
