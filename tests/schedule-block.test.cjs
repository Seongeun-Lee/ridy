const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const marker = '  // Render rides with filter applied';
const functionStart = html.indexOf('  function createScheduleBlock(data, keyPath, isMine = false) {');
const functionEnd = html.indexOf(marker, functionStart);
assert.ok(functionStart >= 0 && functionEnd > functionStart, 'createScheduleBlock should be present');
const blockFunction = html.slice(functionStart, functionEnd);

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = '';
    this.listeners = {};
    this._textContent = '';
  }
  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }
  get textContent() {
    return this._textContent + this.children.map(child => child.textContent).join('');
  }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
}

function renderRide(data) {
  const createdElements = [];
  const context = {
    document: {
      createElement(tagName) {
        const node = new TestElement(tagName);
        createdElements.push(node);
        return node;
      }
    },
    ref() {}, db: {}, confirm() { return false; }, remove() {}, push() {}, userID: 'test-user'
  };
  vm.runInNewContext(blockFunction + '\nthis.renderBlock = createScheduleBlock;', context);
  return { block: context.renderBlock(data, 'rides/test/key'), createdElements };
}

test('renders ordinary ride fields as readable text', () => {
  const { block } = renderRide({
    driver: 'Mina Kim', destination: 'Honolulu', date: '2026-10-15', time: '08:30', seats: '3'
  });
  for (const value of ['Driver:Mina Kim', 'Destination:Honolulu', 'Date:2026-10-15', 'Time:08:30', 'Seats:3']) {
    assert.ok(block.textContent.includes(value), value);
  }
});

test('shows HTML tags as literal text without creating injected elements', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const { block, createdElements } = renderRide({ driver: payload });
  assert.ok(block.textContent.includes(payload));
  assert.equal(createdElements.some(element => element.tagName === 'img'), false);
});

test('shows event-handler markup as literal text', () => {
  const payload = '<svg onload=alert(1)>';
  const { block, createdElements } = renderRide({ destination: payload });
  assert.ok(block.textContent.includes(payload));
  assert.equal(createdElements.some(element => element.tagName === 'svg'), false);
});

test('preserves special characters exactly', () => {
  const payload = `O'Neil & Sons < > " 🚗`;
  const { block } = renderRide({ driver: payload });
  assert.ok(block.textContent.includes(payload));
});

test('uses textContent and contains no HTML-string rendering assignment', () => {
  assert.match(blockFunction, /valueElement\.textContent = String\(value \?\? ''\)/);
  assert.doesNotMatch(html, /\.innerHTML\s*=/);
});

