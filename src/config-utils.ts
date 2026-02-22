export interface PipelineConfig {
  devCommand: string;
  devReadyPattern: string;
  testCommands: string[];
}

export function resolvePipelineConfig(rawPipeline: any): PipelineConfig {
  return {
    devCommand: rawPipeline?.devCommand ?? "",
    devReadyPattern: rawPipeline?.devReadyPattern ?? "",
    testCommands: rawPipeline?.testCommands ?? [],
  };
}
