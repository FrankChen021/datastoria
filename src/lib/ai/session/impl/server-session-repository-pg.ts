import { knex, type Knex } from "knex";
import { AbstractServerSessionRepository } from "./server-session-repository-sql-shared";

export class ServerSessionRepositoryPg extends AbstractServerSessionRepository {
  private pgKnex: Knex | null = null;
  private readyPromise: Promise<void> | null = null;

  constructor(private readonly connectionUrl: string) {
    super({
      getDb: () => this.getPgKnex(),
      nowExpression: "CURRENT_TIMESTAMP",
      supportsForUpdate: true,
      ensureReady: () => this.ensurePgReady(),
    });
  }

  private getPgKnex(): Knex {
    if (!this.pgKnex) {
      this.pgKnex = knex({
        client: "pg",
        connection: this.connectionUrl,
      });
    }
    return this.pgKnex;
  }

  private async ensurePgReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = Promise.resolve();
    }

    // Intentionally no-op.
    // Do NOT add runtime DDL here. In production, this repository may connect to
    // managed/shared Postgres where CREATE/ALTER permissions are not granted.
    // Schema creation and migration must be handled outside the app lifecycle.
    await this.readyPromise;
  }
}
