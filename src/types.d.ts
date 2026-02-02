declare module "cmdk";

declare module "*/SKILL.md" {
  const content: string;
  export default content;
}

declare module "next-auth" {
  interface Session {
    user: {
      id?: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
