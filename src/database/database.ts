import { Platform } from 'react-native';
import { CREATE_TABLES_SQL, CREATE_INDEXES_SQL } from './schema';

const DB_NAME = 'taxe_agent_v5.db'; // Version 5 - ajout service_id pour taxes directes

let db: any = null;

// Vérifier si on est sur le web
const isWeb = Platform.OS === 'web';

export const getDatabase = async (): Promise<any> => {
  if (db) {
    return db;
  }
  
  if (isWeb) {
    // Sur le web, utiliser un mock en mémoire
    console.log('Running on web - using in-memory storage');
    db = createWebMockDb();
    return db;
  }
  
  // Sur mobile, utiliser expo-sqlite
  const SQLite = await import('expo-sqlite');
  db = await SQLite.openDatabaseAsync(DB_NAME);
  return db;
};

// Mock DB pour le web (stockage en mémoire avec localStorage)
const createWebMockDb = () => {
  const getStorageKey = (table: string) => `taxe_db_${table}`;
  
  const getTableData = (table: string): any[] => {
    try {
      const data = localStorage.getItem(getStorageKey(table));
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  };
  
  const setTableData = (table: string, data: any[]) => {
    localStorage.setItem(getStorageKey(table), JSON.stringify(data));
  };

  return {
    execAsync: async (sql: string) => {
      console.log('Web mock execAsync:', sql.substring(0, 50));
    },
    runAsync: async (sql: string, params: any[] = []) => {
      const sqlLower = sql.toLowerCase();
      
      // INSERT
      if (sqlLower.includes('insert into')) {
        const tableMatch = sql.match(/insert\s+(?:or\s+replace\s+)?into\s+(\w+)/i);
        if (tableMatch) {
          const table = tableMatch[1];
          const data = getTableData(table);
          
          // Extraire les colonnes
          const colMatch = sql.match(/\(([^)]+)\)\s+values/i);
          if (colMatch) {
            const columns = colMatch[1].split(',').map(c => c.trim());
            const row: any = {};
            columns.forEach((col, i) => {
              row[col] = params[i];
            });
            
            // Si OR REPLACE, supprimer l'ancien
            if (sqlLower.includes('or replace')) {
              const pkCol = columns[0];
              const idx = data.findIndex(r => r[pkCol] === params[0]);
              if (idx >= 0) data.splice(idx, 1);
            }
            
            data.push(row);
            setTableData(table, data);
          }
        }
      }
      
      // DELETE
      if (sqlLower.includes('delete from')) {
        const tableMatch = sql.match(/delete\s+from\s+(\w+)/i);
        if (tableMatch) {
          const table = tableMatch[1];
          if (sqlLower.includes('where')) {
            const data = getTableData(table);
            const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\?/i);
            if (whereMatch && params.length > 0) {
              const col = whereMatch[1];
              const filtered = data.filter(r => r[col] !== params[0]);
              setTableData(table, filtered);
            }
          } else {
            setTableData(table, []);
          }
        }
      }
      
      // UPDATE
      if (sqlLower.includes('update')) {
        const tableMatch = sql.match(/update\s+(\w+)\s+set/i);
        if (tableMatch) {
          const table = tableMatch[1];
          const data = getTableData(table);
          const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\?/i);
          if (whereMatch) {
            const whereCol = whereMatch[1];
            const whereVal = params[params.length - 1];
            const setMatch = sql.match(/set\s+(.+)\s+where/i);
            if (setMatch) {
              const setParts = setMatch[1].split(',');
              data.forEach(row => {
                if (row[whereCol] === whereVal) {
                  setParts.forEach((part, i) => {
                    const colName = part.split('=')[0].trim();
                    row[colName] = params[i];
                  });
                }
              });
              setTableData(table, data);
            }
          }
        }
      }
    },
    getFirstAsync: async <T>(sql: string, params: any[] = []): Promise<T | null> => {
      const tableMatch = sql.match(/from\s+(\w+)/i);
      if (!tableMatch) return null;
      
      const table = tableMatch[1];
      const data = getTableData(table);
      
      if (sql.toLowerCase().includes('where') && params.length > 0) {
        const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\?/i);
        if (whereMatch) {
          const col = whereMatch[1];
          return data.find(r => r[col] === params[0]) || null;
        }
      }
      
      return data[0] || null;
    },
    getAllAsync: async <T>(sql: string, params: any[] = []): Promise<T[]> => {
      const tableMatch = sql.match(/from\s+(\w+)/i);
      if (!tableMatch) return [];
      
      const table = tableMatch[1];
      let data = getTableData(table);
      
      if (sql.toLowerCase().includes('where') && params.length > 0) {
        const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\?/i);
        if (whereMatch) {
          const col = whereMatch[1];
          data = data.filter(r => r[col] === params[0]);
        }
      }
      
      return data;
    },
    closeAsync: async () => {},
  };
};

export const initializeDatabase = async (): Promise<void> => {
  const database = await getDatabase();
  
  if (isWeb) {
    console.log('Database initialized successfully (web mock)');
    return;
  }
  
  // Créer les tables (mobile uniquement)
  const statements = CREATE_TABLES_SQL.split(';').filter(s => s.trim());
  for (const statement of statements) {
    if (statement.trim()) {
      await database.execAsync(statement + ';');
    }
  }
  
  // Migrations: ajouter les colonnes manquantes AVANT les index
  await runMigrations(database);
  
  // Créer les index (après les migrations pour que toutes les colonnes existent)
  const indexStatements = CREATE_INDEXES_SQL.split(';').filter(s => s.trim());
  for (const statement of indexStatements) {
    if (statement.trim()) {
      await database.execAsync(statement + ';');
    }
  }
  
  console.log('Database initialized successfully');
};

// Exécuter les migrations pour les colonnes manquantes
const runMigrations = async (database: any): Promise<void> => {
  try {
    // Vérifier et ajouter la colonne 'role' à offline_credentials si elle n'existe pas
    try {
      await database.execAsync(`ALTER TABLE offline_credentials ADD COLUMN role TEXT DEFAULT 'agent';`);
      console.log('Migration: Added role column to offline_credentials');
    } catch (e: any) {
      // La colonne existe déjà, ignorer l'erreur
      if (!e.message?.includes('duplicate column')) {
        console.log('Role column already exists or migration skipped');
      }
    }
    
    // Migration: Ajouter la colonne 'service_id' à local_tax_types pour les taxes directes
    try {
      await database.execAsync(`ALTER TABLE local_tax_types ADD COLUMN service_id INTEGER;`);
      console.log('Migration: Added service_id column to local_tax_types');
    } catch (e: any) {
      // La colonne existe déjà, ignorer l'erreur
      if (!e.message?.includes('duplicate column')) {
        console.log('service_id column already exists or migration skipped');
      }
    }

    // Migration: Ajouter les colonnes de paiement par tranche
    const installmentColumns = [
      { name: 'installment_number', type: 'INTEGER' },
      { name: 'installment_total', type: 'INTEGER' },
      { name: 'installment_group_id', type: 'TEXT' },
    ];
    for (const col of installmentColumns) {
      try {
        await database.execAsync(`ALTER TABLE local_payments_queue ADD COLUMN ${col.name} ${col.type};`);
        console.log(`Migration: Added ${col.name} column to local_payments_queue`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) {
          console.log(`${col.name} column already exists or migration skipped`);
        }
      }
    }
  } catch (error) {
    console.log('Migrations completed with some skipped (columns may already exist)');
  }
};

export const closeDatabase = async (): Promise<void> => {
  if (db) {
    await db.closeAsync();
    db = null;
  }
};
