import { deflateSync } from 'node:zlib';

export type SheetRow = Array<string | number | null | undefined>;

export function protectCsvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildCsv(headers: string[], rows: SheetRow[]): Buffer {
  const lines = [
    headers.map(protectCsvCell).join(','),
    ...rows.map((row) => row.map(protectCsvCell).join(',')),
  ];
  return Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8');
}

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return ~crc >>> 0;
}

function zipLocal(name: string, content: Buffer) {
  const nameBytes = Buffer.from(name, 'utf8');
  const compressed = deflateSync(content);
  const crc = crc32(content);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(0, 10);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(content.length, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  return {
    local: Buffer.concat([header, nameBytes, compressed]),
    crc,
    compressedSize: compressed.length,
    size: content.length,
    nameBytes,
  };
}

export function buildZip(files: Array<{ name: string; content: Buffer | string }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const packed = zipLocal(file.name, Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8'));
    locals.push(packed.local);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(packed.crc, 16);
    central.writeUInt32LE(packed.compressedSize, 20);
    central.writeUInt32LE(packed.size, 24);
    central.writeUInt16LE(packed.nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, packed.nameBytes]));
    offset += packed.local.length;
  }
  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, end]);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildXlsx(sheets: Array<{ name: string; headers: string[]; rows: SheetRow[] }>): Buffer {
  const shared: string[] = [];
  function share(value: string) {
    const index = shared.indexOf(value);
    if (index >= 0) return index;
    shared.push(value);
    return shared.length - 1;
  }

  const sheetFiles = sheets.map((sheet, index) => {
    const rowsXml = [sheet.headers, ...sheet.rows].map((row, rowIndex) => {
      const cells = row.map((cell, colIndex) => {
        const ref = `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`;
        if (typeof cell === 'number' && Number.isFinite(cell)) {
          return `<c r="${ref}" t="n"><v>${cell}</v></c>`;
        }
        const text = protectCsvCell(cell ?? '').replace(/^'/, '');
        return `<c r="${ref}" t="s"><v>${share(text)}</v></c>`;
      });
      return `<row r="${rowIndex + 1}">${cells.join('')}</row>`;
    });
    const widths = sheet.headers.map((_, col) => {
      const longest = Math.max(
        sheet.headers[col]?.length || 8,
        ...sheet.rows.map((row) => String(row[col] ?? '').length)
      );
      return `<col min="${col + 1}" max="${col + 1}" width="${Math.min(40, Math.max(12, longest + 2))}" customWidth="1"/>`;
    });
    return {
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${widths.join('')}</cols>
<sheetData>${rowsXml.join('')}</sheetData>
</worksheet>`,
    };
  });

  const workbookSheets = sheets
    .map((sheet, index) => `<sheet name="${xmlEscape(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join('');
  const workbookRels = sheets
    .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
    .join('');
  const sharedXml = shared.map((value) => `<si><t>${xmlEscape(value)}</t></si>`).join('');

  return buildZip([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${workbookSheets}</sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`,
    },
    {
      name: 'xl/sharedStrings.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${sharedXml}</sst>`,
    },
    ...sheetFiles,
  ]);
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function hexToRgb(hex?: string): { r: number; g: number; b: number } {
  const value = hex && /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#2563EB';
  return {
    r: Number.parseInt(value.slice(1, 3), 16) / 255,
    g: Number.parseInt(value.slice(3, 5), 16) / 255,
    b: Number.parseInt(value.slice(5, 7), 16) / 255,
  };
}

export function buildSummaryPdf(input: {
  churchName: string;
  primaryColor?: string;
  accentColor?: string;
  periodLabel: string;
  generatedAt: string;
  lines: string[];
}): Buffer {
  const color = hexToRgb(input.primaryColor);
  const lines = [
    input.churchName,
    'Relatorio resumido',
    `Periodo: ${input.periodLabel}`,
    `Gerado em: ${input.generatedAt}`,
    '',
    ...input.lines,
    '',
    'Este PDF nao inclui nomes, telefones, textos de oracao ou outros dados pessoais.',
  ];
  const content = [
    `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} rg`,
    '40 760 515 40 re f',
    '1 1 1 rg',
    'BT /F1 16 Tf 52 774 Td (Relatorios da igreja) Tj ET',
    '0 0 0 rg',
    ...lines.map((line, index) => `BT /F1 11 Tf 48 ${720 - index * 16} Td (${pdfEscape(line)}) Tj ET`),
  ].join('\n');
  const stream = Buffer.from(content, 'utf8');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let offset = 9 + '%PDF-1.4\n'.length;
  const xref = ['0000000000 65535 f '];
  const body = objects.map((object, index) => {
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`;
    xref.push(`${String(offset).padStart(10, '0')} 00000 n `);
    offset += Buffer.byteLength(chunk);
    return chunk;
  });
  const xrefStart = offset;
  const pdf = `%PDF-1.4
${body.join('')}xref
0 ${objects.length + 1}
${xref.join('\n')}
trailer << /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefStart}
%%EOF
`;
  return Buffer.from(pdf, 'utf8');
}

export function formatDurationMs(value: number | null): string {
  if (value == null) return 'Sem dados suficientes';
  const minutes = Math.round(value / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} h`;
}

export function compareLabel(percent: number | null): string {
  if (percent == null) return 'Sem comparação disponível';
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent}%`;
}
