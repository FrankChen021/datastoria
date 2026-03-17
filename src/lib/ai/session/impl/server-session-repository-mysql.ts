import { knex, type Knex } from "knex";
import { AbstractServerSessionRepository } from "./server-session-repository-sql-shared";

export class ServerSessionRepositoryMySql extends AbstractServerSessionRepository {
  private mySqlKnex: Knex | null = null;

  constructor(private readonly connectionUrl: string) {
    super({
      getDb: () => this.getMySqlKnex(),
      nowExpression: "CURRENT_TIMESTAMP(3)",
      supportsForUpdate: true,
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
}
