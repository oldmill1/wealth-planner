from __future__ import annotations

import sqlite3
from pathlib import Path

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
        ok = "#86efac"
        warn = "#fca5a5"

        db_status, db_path, db_note = self._check_database()

        lines = []
        lines.append(f"[bold {color}]WEALTH PLANNER BIOS[/bold {color}]")
        lines.append(f"[{color}]-------------------[/{color}]")
        lines.append(
            f"[bold]1.[/bold] Check database at user config: "
            f"[bold {ok if db_status else warn}]{'PASS' if db_status else 'FAIL'}[/bold {ok if db_status else warn}]"
        )
        lines.append(f"[dim]{db_note}[/dim]")
        lines.append(f"[dim]{db_path}[/dim]")
        lines.append(f"[dim]Press Ctrl+C to quit[/dim]")
        box.update("\n".join(lines))

    def _check_database(self) -> tuple[bool, Path, str]:
        db_path = Path.home() / ".config" / "wealth-planner" / "wealth.db"
        try:
            db_path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(db_path)
            conn.close()
            if db_path.exists():
                return True, db_path, "Database ready"
            return False, db_path, "Connection closed but file missing"
        except sqlite3.Error as error:
            return False, db_path, f"SQLite error: {error}"
        except OSError as error:
            return False, db_path, f"Filesystem error: {error}"


def main() -> None:
    HelloWorldApp().run()


if __name__ == "__main__":
    main()
