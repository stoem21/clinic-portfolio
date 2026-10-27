#!/usr/bin/env python3
"""Create local-only credentials; never overwrite an existing environment."""
import os
from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
target = root / '.env'
values = {'CLINIC_PORT': '4101', 'DEMO_AUTO_LOGIN': 'true'}
for key in ['POSTGRES_PASSWORD', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'DEMO_PASSWORD', 'DEMO_OWNER_PASSWORD']:
    values[key] = secrets.token_hex(32)
try:
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    raise SystemExit('Existing .env preserved. Edit it locally if necessary.')
with os.fdopen(descriptor, 'w') as stream:
    stream.write(''.join(f'{key}={value}\n' for key, value in values.items()))
print('Created private .env. Demo auto-login is enabled for the isolated demo database.')
