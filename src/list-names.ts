export function generateListNames(botName: string) {
  return {
    todo: "📋 TODO",
    taskRevision: `🔍 ${botName} Revision`,
    reviewing: `⏳ ${botName} Reviewing`,
    todoReviewed: "✅ Reviewed",
    taskDevelopment: `🛠️ ${botName} Development`,
    developing: `⚙️ ${botName} Developing`,
    taskDeveloped: "🚀 Ready for Review",
  };
}
