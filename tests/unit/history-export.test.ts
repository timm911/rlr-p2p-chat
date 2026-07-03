import { renderHistoryHtml, renderHistoryTxt, bodyOf, senderColor, ExportMessage } from '../../src/main/history-export';

// A fixed day so day-header assertions are stable regardless of when tests run.
const D = (h: number, m = 0) => new Date(2026, 5, 11, h, m, 0).getTime(); // 2026-06-11

const messages: ExportMessage[] = [
  { type: 'chat', from: 'RLRJupiter', content: 'hello there', timestamp: D(9, 0) },
  { type: 'system', content: 'Ripster changed status to Home', timestamp: D(9, 1) },
  { type: 'chat', from: 'Ripster', content: 'hi <b>&</b> "friend"', timestamp: D(9, 2) },
  { type: 'file', from: 'Ramjet', fileTransfer: { fileName: 'pic.png', fileType: 'image/png' }, timestamp: D(9, 3) },
  { type: 'file', from: 'Ramjet', fileTransfer: { fileName: 'voice.webm', fileType: 'audio/webm' }, timestamp: D(9, 4) },
  { type: 'file', from: 'Ramjet', fileTransfer: { fileName: 'report.pdf', fileType: 'application/pdf' }, timestamp: D(9, 5) },
  { type: 'chat', from: 'Ripster', content: 'gone', removed: true, timestamp: D(9, 6) },
];

describe('history-export bodyOf', () => {
  it('renders placeholders for files by kind', () => {
    expect(bodyOf(messages[3])).toBe('[Photo: pic.png]');
    expect(bodyOf(messages[4])).toBe('[Voice message]');
    expect(bodyOf(messages[5])).toBe('[File: report.pdf]');
  });
  it('marks removed messages', () => {
    expect(bodyOf(messages[6])).toBe('[message removed]');
  });
});

describe('history-export senderColor', () => {
  it('maps each identity to its accent, unknown to gray', () => {
    expect(senderColor('RLRJupiter')).toBe('#38bdf8');
    expect(senderColor('Ramjet')).toBe('#f59e0b');
    expect(senderColor('Ripster')).toBe('#f472b6');
    expect(senderColor('nobody')).toBe('#94a3b8');
  });
});

describe('renderHistoryTxt', () => {
  const txt = renderHistoryTxt(messages, new Date(D(10)));
  it('includes a day header and sender lines', () => {
    expect(txt).toContain('— Thursday, June 11, 2026 —');
    expect(txt).toContain('RLRJupiter: hello there');
    expect(txt).toContain('* Ripster changed status to Home');
    expect(txt).toContain('Ramjet: [Photo: pic.png]');
  });
  it('does NOT escape in plain text (raw content preserved)', () => {
    expect(txt).toContain('hi <b>&</b> "friend"');
  });
});

describe('renderHistoryHtml', () => {
  const html = renderHistoryHtml(messages, new Date(D(10)));
  it('is a self-contained document with a day header', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<div class="day">Thursday, June 11, 2026</div>');
  });
  it('escapes HTML-special characters in content', () => {
    expect(html).toContain('hi &lt;b&gt;&amp;&lt;/b&gt; &quot;friend&quot;');
    expect(html).not.toContain('<b>&</b>');
  });
  it('color-codes senders and renders system + file placeholders', () => {
    expect(html).toContain('color:#38bdf8');       // RLRJupiter
    expect(html).toContain('class="sys"');          // system line
    expect(html).toContain('[Photo: pic.png]');
    expect(html).toContain('[Voice message]');
  });
  it('reports the message count', () => {
    expect(html).toContain(`${messages.length} messages`);
  });
});

describe('empty history', () => {
  it('still produces a valid document / header', () => {
    expect(renderHistoryHtml([], new Date(D(10)))).toContain('0 messages');
    expect(renderHistoryTxt([], new Date(D(10)))).toContain('history export');
  });
});
