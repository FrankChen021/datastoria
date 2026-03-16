declare module "js-yaml" {
  export function load(input: string): unknown;

  const yaml: {
    load: typeof load;
  };

  export default yaml;
}
