import { knex, type Knex } from "knex";
import { AbstractServerSessionRepository } from "./server-session-repository-sql-shared";

export class ServerSessionRepositoryMySql extends AbstractServerSessionRepository {
  private mySqlKnex: Knex | null = null;
  private readyPromise: Promise<void> | null = null;

  constructor(private readonly connectionUrl: string) {
    super({
      getDb: () => this.getMySqlKnex(),
      nowExpression: "CURRENT_TIMESTAMP(3)",
      supportsForUpdate: true,
      ensureReady: () => this.ensureMySqlReady(),
    });
  }

  private getMySqlKnex(): Knex {
    if (!this.mySqlKnex) {
      this.mySqlKnex = knex({
        client: "mysql2",
        connection: this.connectionUrl,
      });
    }
    return this.mySqlKnex;
  }

  private async ensureMySqlReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = Promise.resolve();
    }

    // Intentionally no-op.
    // Do NOT add runtime DDL here. In production, this repository may connect to
    // managed/shared MySQL where CREATE/ALTER permissions are not granted.
    // Schema creation and migration must be handled outside the app lifecycle.
    await this.readyPromise;
  }
}
