"""Read-only workspace metadata projection; detailed project API stays unchanged."""
import json

FIELDS = ('id', 'name', 'cell', 'pdk_id', 'revision', 'source')


def list_projects(db, metadata_only=False):
    if not metadata_only:
        return [value for row in db.execute('SELECT data FROM projects ORDER BY rowid DESC')
                if not (value := json.loads(row[0])).get('pvt_point')]
    # SQLite extracts only card fields before Python decodes any schematic arrays.
    rows = db.execute("""SELECT json_extract(data, '$.id', '$.name', '$.cell',
        '$.pdk_id', '$.revision', '$.source', '$.pvt_point')
        FROM projects ORDER BY rowid DESC""")
    entries = []
    for row in rows:
        values = json.loads(row[0])
        if not values[-1]:
            entries.append(dict(zip(FIELDS, values[:-1])))
    return entries
