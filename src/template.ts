import fs from "fs/promises";

export async function loadTemplate(
  templatePath: string,
  vars: Record<string, string>
): Promise<string> {
  const content = await fs.readFile(templatePath, "utf-8");
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return key in vars ? vars[key] : match;
  });
}
