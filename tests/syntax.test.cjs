'use strict';

const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const file of ['index.html', 'glass-quote.html', 'drive-direct-test.html']) {
  test('JavaScript syntax: ' + file, () => {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      if (match[1].trim()) new vm.Script(match[1], { filename: file });
    }
  });
}

test('JavaScript syntax: drive-direct-storage.js', () => {
  new vm.Script(fs.readFileSync(path.join(__dirname, '../drive-direct-storage.js'), 'utf8'));
});
