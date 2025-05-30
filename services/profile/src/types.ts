export interface Profile {
    userId: string;           // PK - Auth user ID (64 char hex)
    email: string;            // User's email address
    name: string;             // User's full name
    initial_language_to_learn: string; // Initial language the user wants to learn
    createdAt: string;
    updatedAt: string;
  }
