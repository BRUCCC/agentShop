"""L0 / L1 / L2 文件系统。

布局和 OpenViking 的目录语义对齐：

- `.abstract.md` 是 L0，一两句话，用来快速判断这个目录有没有关系。
- `.overview.md` 是 L1，稍长的导航和要点，用来在候选目录里做精排。
- 其他 Markdown 是 L2，真正写代码时要读的规则和示例。

L0 和 L1 是目录级旁路文件，不是给每个源文件各做一份。
普通列目录会把这两个点文件藏起来。
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ad_rag.config import KNOWLEDGE_ROOT, URI_SCHEME
from ad_rag.textutil import first_heading, split_frontmatter


@dataclass
class KnowledgeDir:
    """一个可检索的知识目录。向量库里的一行就是它，不是里面的单个文件。"""

    uri: str
    path: Path
    title: str
    l0: str
    l1: str
    l2_files: list[Path]


class RagFS:
    """把 viking:// URI 映射到 knowledge 目录，并按层读取。"""

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or KNOWLEDGE_ROOT).resolve()

    def resolve(self, uri: str) -> Path:
        """把 URI 转成绝对路径，并限制在知识库根目录里面。"""

        if not uri.startswith(URI_SCHEME):
            raise ValueError(f"URI 需要以 {URI_SCHEME} 开头: {uri}")
        relative = uri[len(URI_SCHEME) :].strip("/")
        path = (self.root / relative).resolve()
        if path != self.root and self.root not in path.parents:
            raise ValueError(f"URI 超出知识库根目录: {uri}")
        return path

    def to_uri(self, path: Path) -> str:
        """磁盘路径转回 viking URI，分隔符固定为斜杠。"""

        relative = path.resolve().relative_to(self.root).as_posix()
        return URI_SCHEME + relative

    def iter_index_dirs(self) -> list[KnowledgeDir]:
        """找出需要写入向量库的目录。

        没有 L2 的目录只做导航，例如知识库根目录。
        它们可以被 ls 和 overview 读到，但不会占检索名额。
        有正文却缺少 L0 或 L1 时直接失败，避免静默建出一个无法精排的索引。
        """

        found: list[KnowledgeDir] = []
        if not self.root.exists():
            return found

        for directory in sorted(path for path in self.root.rglob("*") if path.is_dir()):
            l2_files = self._l2_files(directory)
            if not l2_files:
                continue
            l0 = self._sidecar_body(directory / ".abstract.md")
            l1 = self._sidecar_body(directory / ".overview.md")
            uri = self.to_uri(directory)
            if not l0 or not l1:
                raise FileNotFoundError(f"{uri} 有 L2 正文，但缺少 L0 或 L1")
            found.append(
                KnowledgeDir(
                    uri=uri,
                    path=directory,
                    title=first_heading(l1, directory.name),
                    l0=l0,
                    l1=l1,
                    l2_files=l2_files,
                )
            )
        return found

    def get(self, uri: str) -> KnowledgeDir:
        """按 URI 读取一个知识目录。检索命中后用它加载三层内容。"""

        directory = self.resolve(uri)
        if not directory.is_dir():
            raise FileNotFoundError(f"不是知识目录: {uri}")
        l2_files = self._l2_files(directory)
        l0 = self._sidecar_body(directory / ".abstract.md")
        l1 = self._sidecar_body(directory / ".overview.md")
        if not l0 or not l1:
            raise FileNotFoundError(f"{uri} 缺少 L0 或 L1")
        return KnowledgeDir(
            uri=self.to_uri(directory),
            path=directory,
            title=first_heading(l1, directory.name),
            l0=l0,
            l1=l1,
            l2_files=l2_files,
        )

    def abstract(self, uri: str) -> str:
        """返回 L0 正文。frontmatter 不返回，和 OpenViking 的 abstract() 一致。"""

        return self._sidecar_body(self.resolve(uri) / ".abstract.md")

    def overview(self, uri: str) -> str:
        """返回 L1 正文，供调用方先看导航、再决定要不要读 L2。"""

        return self._sidecar_body(self.resolve(uri) / ".overview.md")

    def read(self, uri: str) -> str:
        """读取一个文件的原始内容。直接点名 sidecar 时保留 frontmatter。"""

        path = self.resolve(uri)
        if not path.is_file():
            raise FileNotFoundError(f"不是文件: {uri}")
        return path.read_text(encoding="utf-8")

    def read_l2(self, knowledge_dir: KnowledgeDir) -> list[dict[str, str]]:
        """按文件名顺序加载该目录的全部 L2。精排之后才调用，避免把无关正文塞进上下文。"""

        documents = []
        for path in knowledge_dir.l2_files:
            documents.append(
                {
                    "uri": self.to_uri(path),
                    "name": path.name,
                    "content": path.read_text(encoding="utf-8").strip(),
                }
            )
        return documents

    def ls(self, uri: str) -> list[dict[str, str]]:
        """列出目录的直接子项，隐藏 .abstract.md 和 .overview.md。"""

        directory = self.resolve(uri)
        if not directory.is_dir():
            raise FileNotFoundError(f"不是目录: {uri}")
        entries = []
        for child in sorted(directory.iterdir(), key=lambda item: item.name):
            if child.name.startswith("."):
                continue
            entries.append(
                {
                    "name": child.name,
                    "uri": self.to_uri(child),
                    "kind": "dir" if child.is_dir() else "file",
                }
            )
        return entries

    def _l2_files(self, directory: Path) -> list[Path]:
        """L2 只收录这个目录自己的 Markdown，不把子目录的文件算进来。"""

        return sorted(
            path
            for path in directory.glob("*.md")
            if path.is_file() and not path.name.startswith(".")
        )

    def _sidecar_body(self, path: Path) -> str:
        """读取旁路文件的可见正文。文件不存在时返回空串，由调用方决定是否报错。"""

        if not path.is_file():
            return ""
        _, body = split_frontmatter(path.read_text(encoding="utf-8"))
        return body.strip()
