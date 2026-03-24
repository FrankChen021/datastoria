import { DatabaseSkillProvider } from "./database-skill-provider";
import { DiskSkillProvider } from "./disk-skill-provider";
import { getServerSkillRepository } from "./server-skill-repository-factory";
import { CompositeSkillProvider, type SkillProvider } from "./skill-provider";

export type SkillProviderFactoryOptions = {
  userId: string | null;
  includeDraft?: boolean;
};

export function getSkillProvider(options: SkillProviderFactoryOptions): SkillProvider {
  const providers: SkillProvider[] = [new DiskSkillProvider()];
  const repository = getServerSkillRepository();
  providers.push(
    new DatabaseSkillProvider(repository, {
      userId: options.userId,
      includeDraft: options.includeDraft,
    })
  );
  return new CompositeSkillProvider(providers);
}
