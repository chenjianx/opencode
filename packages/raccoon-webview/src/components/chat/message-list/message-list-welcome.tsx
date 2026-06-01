export function WelcomeState() {
  return (
    <div className="welcome-state">
      <div className="welcome-card">
        <div className="welcome-top">
          <div className="welcome-mark">R</div>
          <div className="welcome-title">小浣熊</div>
        </div>
        <p className="welcome-copy">
          欢迎你 <span className="welcome-mention">@RaccoonEthan</span>，我是代码小浣熊，您的代码助手。您可以让我与您一起编写代码，或向我询问任何技术问题。
        </p>
        <div className="welcome-tip">
          <span className="welcome-tip-icon">◉</span>
          <span>您可以使用以下快捷键来提高效率：</span>
        </div>
        <ul className="welcome-list">
          <li>使用 <kbd>⌘L</kbd> 快速唤醒助手</li>
          <li>输入 <kbd>@</kbd> 添加任务背景上下文，帮助我更好地理解您的需求</li>
          <li>输入 <kbd>/</kbd> 查看更多快捷操作。</li>
        </ul>
        <p className="welcome-footer">
          访问 <a href="#" onClick={(event) => event.preventDefault()}>小浣熊官网</a> 查看官方使用教程。
        </p>
      </div>
    </div>
  )
}
