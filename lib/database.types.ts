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
          plaid_account_id: string;
          custom_name: string | null;
        };
        Insert: {
          id: string;
          bank_name: string;
          name: string;
          type: "checking" | "savings" | "credit";
          balance: number;
          plaid_account_id: string;
          custom_name?: string | null;
        };
        Update: {
          id?: string;
          bank_name?: string;
          name?: string;
          type?: "checking" | "savings" | "credit";
          balance?: number;
          plaid_account_id?: string;
          custom_name?: string | null;
        };
        Relationships: [];
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
          type: "income" | "expense" | "transfer";
        };
        Insert: {
          id: string;
          date: string;
          account_id: string;
          description: string;
          category: string;
          subcategory: string;
          amount: number;
          type: "income" | "expense" | "transfer";
        };
        Update: {
          id?: string;
          date?: string;
          account_id?: string;
          description?: string;
          category?: string;
          subcategory?: string;
          amount?: number;
          type?: "income" | "expense" | "transfer";
        };
        Relationships: [];
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
        Update: {
          id?: string;
          category?: string;
          subcategory?: string;
          budgeted_amount?: number;
          month?: number;
          year?: number;
        };
        Relationships: [];
      };
      plaid_items: {
        Row: {
          id: string;
          access_token: string;
          item_id: string;
          institution_name: string;
          cursor: string | null;
          created_at: string;
        };
        Insert: {
          access_token: string;
          item_id: string;
          institution_name: string;
          cursor?: string | null;
        };
        Update: {
          access_token?: string;
          item_id?: string;
          institution_name?: string;
          cursor?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
  };
};

// Convenience row types
export type DbAccount    = Database["public"]["Tables"]["accounts"]["Row"];
export type DbTransaction = Database["public"]["Tables"]["transactions"]["Row"];
export type DbBudget     = Database["public"]["Tables"]["budgets"]["Row"];
export type DbPlaidItem  = Database["public"]["Tables"]["plaid_items"]["Row"];
