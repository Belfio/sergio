export function generateListNames(botName: string) {
  return {
    todo: "TODO",
    taskRevision: `${botName} Task Revision`,
    reviewing: `${botName} Reviewing`,
    todoReviewed: "TODO Reviewed",
    taskDevelopment: `${botName} Task Development`,
    developing: `${botName} Developing`,
    taskDeveloped: "Task Developed",
  };
}
