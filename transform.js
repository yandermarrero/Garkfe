
const salva1 = JSON.parse(process.argv[2]);
const salva2 = JSON.parse(process.argv[3]);

const MAYORISTA_ID = 2;

// Get receivables from Salva 1 for Mayorista
const debts1 = salva1.data.data.find(t => t.tableName === 'debts').rows;
const mayoristaReceivables1 = debts1.filter(d => d.creditorStoreId === MAYORISTA_ID);

// Get all debts from Salva 2
const debts2Table = salva2.data.data.find(t => t.tableName === 'debts');
const originalDebts2 = debts2Table.rows;

// Filter out Mayorista receivables from Salva 2
const keptDebts2 = originalDebts2.filter(d => d.creditorStoreId !== MAYORISTA_ID);

// Combine
const finalDebts = [...keptDebts2, ...mayoristaReceivables1];

// Sort by ID to maintain some order (optional but helpful)
finalDebts.sort((a, b) => a.id - b.id);

// Update Salva 2
debts2Table.rows = finalDebts;
debts2Table.rowCount = finalDebts.length;

// Update metadata in tables array
const debtsTableMeta = salva2.data.tables.find(t => t.name === 'debts');
debtsTableMeta.rowCount = finalDebts.length;

process.stdout.write(JSON.stringify(salva2, null, 2));
