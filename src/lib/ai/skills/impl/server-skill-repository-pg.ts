import { knex, type Knex } from "knex";
import { AbstractServerSkillRepository } from "./server-skill-repository-sql-shared";

export class ServerSkillRepositoryPg extends AbstractServerSkillRepository {
  private pgKnex: Knex | null = null;

  constructor(private readonly connectionUrl: string) {
    super({
      getDb: () => this.getPgKnex(),
      nowExpression: "CURRENT_TIMESTAMP",
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
