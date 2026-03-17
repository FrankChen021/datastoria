import { knex, type Knex } from "knex";
import { AbstractServerSessionRepository } from "./server-session-repository-sql-shared";

export class ServerSessionRepositoryPg extends AbstractServerSessionRepository {
  private pgKnex: Knex | null = null;

  constructor(private readonly connectionUrl: string) {
    super({
      getDb: () => this.getPgKnex(),
      nowExpression: "CURRENT_TIMESTAMP",
      supportsForUpdate: true,
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
}
