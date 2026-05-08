
const fs = require('fs');

const salva1 = JSON.parse(fs.readFileSync('salva1_full.json', 'utf8'));
const salva2 = JSON.parse(fs.readFileSync('salva2_full.json', 'utf8'));

const MAYORISTA_ID = 2;

// Extract debts table from Salva 1
const debts1 = salva1.data.data.find(t => t.tableName === 'debts').rows;
// Filter for Mayorista receivables
const mayoristaReceivables1 = debts1.filter(d => d.creditorStoreId === MAYORISTA_ID && d.type === 'receivable');

// Extract debts table from Salva 2
const salva2Data = salva2.data.data;
const debts2Table = salva2Data.find(t => t.tableName === 'debts');
const debts2 = debts2Table.rows;

// Remove existing Mayorista receivables from Salva 2
const remainingDebts2 = debts2.filter(d => !(d.creditorStoreId === MAYORISTA_ID && d.type === 'receivable'));

// Merge
const finalDebts = [...remainingDebts2, ...mayoristaReceivables1];

// Update Salva 2 structure
debts2Table.rows = finalDebts;
debts2Table.rowCount = finalDebts.length;

// Update metadata
const debtsMeta = salva2.data.tables.find(t => t.name === 'debts');
debtsMeta.rowCount = finalDebts.length;

fs.writeFileSync('new_salva2.json', JSON.stringify(salva2, null, 2));
console.log('Merge complete. New debt count:', finalDebts.length);
