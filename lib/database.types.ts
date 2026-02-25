export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          bank_name: string;
          name: string;
          type: "checking" | "savings" | "credit";
          balance: number;
        };
        Insert: {
          id: string;
          bank_name: string;
          name: string;
          type: "checking" | "savings" | "credit";
          balance: number;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
      };
      transactions: {
        Row: {
          id: string;
          date: string;
          account_id: string;
          description: string;
          category: string;
          subcategory: string;
          amount: number;
          type: "income" | "expense";
        };
        Insert: {
          id: string;
          date: string;
          account_id: string;
          description: string;
          category: string;
          subcategory: string;
          amount: number;
          type: "income" | "expense";
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
      };
      budgets: {
        Row: {
          id: string;
          category: string;
          subcategory: string;
          budgeted_amount: number;
          month: number;
          year: number;
        };
        Insert: {
          id: string;
          category: string;
          subcategory: string;
          budgeted_amount: number;
          month: number;
          year: number;
        };
        Update: Partial<Database["public"]["Tables"]["budgets"]["Insert"]>;
      };
    };
  };
};

// Convenience row types
export type DbAccount = Database["public"]["Tables"]["accounts"]["Row"];
export type DbTransaction = Database["public"]["Tables"]["transactions"]["Row"];
export type DbBudget = Database["public"]["Tables"]["budgets"]["Row"];
