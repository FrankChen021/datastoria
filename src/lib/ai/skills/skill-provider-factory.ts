import { DatabaseSkillProvider } from "./database-skill-provider";
import { DiskSkillProvider } from "./disk-skill-provider";
import { getServerSkillRepository } from "./repository/server-skill-repository-factory";
import { CompositeSkillProvider, type SkillProvider } from "./skill-provider";

export type SkillProviderFactoryOptions = {
  userId: string | null;
  includeDraft?: boolean;
};

const diskSkillProvider = new DiskSkillProvider();

export class SkillProviderFactory {
  static getProvider(options: SkillProviderFactoryOptions): SkillProvider {
    const repository = getServerSkillRepository();

    return new CompositeSkillProvider([
      diskSkillProvider,
      new DatabaseSkillProvider(repository, {
        userId: options.userId,
        includeDraft: options.includeDraft,
      }),
    ]);
  }
}
