from __future__ import annotations

from textual.app import App, ComposeResult
from textual.widgets import Static


class HelloWorldApp(App[None]):
    CSS = """
    Screen {
        align: center middle;
        background: #0b1020;
    }

    #hello {
        width: auto;
        height: auto;
        border: round #7dd3fc;
        padding: 1 2;
        content-align: center middle;
    }
    """

    def compose(self) -> ComposeResult:
        yield Static("", id="hello")

    def on_mount(self) -> None:
        box = self.query_one("#hello", Static)
        color = "#7dd3fc"

        lines = []
        lines.append(f"[bold {color}]Wealth Planner[/bold {color}]")
        lines.append(f"[dim]Press Ctrl+C to quit[/dim]")
        box.update("\n".join(lines))


def main() -> None:
    HelloWorldApp().run()


if __name__ == "__main__":
    main()
