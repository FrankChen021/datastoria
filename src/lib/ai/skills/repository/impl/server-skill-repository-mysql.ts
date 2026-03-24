import { knex, type Knex } from "knex";
import { AbstractServerSkillRepository } from "./server-skill-repository-sql-shared";

export class ServerSkillRepositoryMySql extends AbstractServerSkillRepository {
  private mySqlKnex: Knex | null = null;

  constructor(private readonly connectionUrl: string) {
    super({
      getDb: () => this.getMySqlKnex(),
      nowExpression: "CURRENT_TIMESTAMP(3)",
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
