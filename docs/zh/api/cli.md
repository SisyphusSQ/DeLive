# DeLive CLI

桌面安装包内含独立的命令行程序。读取会议时请保持 DeLive SQ 运行，窗口可留在后台。运行命令无需另装 Go、Node.js 或插件。

| 平台 | 程序位置 |
| --- | --- |
| macOS | `/Applications/DeLive SQ.app/Contents/Resources/bin/delive` |
| Windows | 安装目录的 `resources\bin\delive.exe` |
| Linux | 安装目录的 `resources/bin/delive`。使用 AppImage 时可从挂载或解包目录复制此独立程序 |

在 macOS 上可直接用完整路径调用，也可以在自己的 PATH 目录创建符号链接，例如：

```sh
mkdir -p "$HOME/.local/bin"
ln -s "/Applications/DeLive SQ.app/Contents/Resources/bin/delive" \
  "$HOME/.local/bin/delive"
```

用同一个系统账号运行 DeLive SQ 和 CLI，即可查询资料。开放 API 关闭时也能使用，无需配置令牌。使用自定义桌面配置目录时，将 `DELIVE_USER_DATA_DIR` 设为该目录的绝对路径。macOS 和 Linux 使用当前用户私有目录中的 Unix socket。Windows 使用独立的本机回环端口，每次启动自动生成凭据，仅当前用户可读取凭据文件。

```sh
delive meetings search "项目周会" --json
delive meetings list --limit 10 --offset 0
delive meetings versions MEETING_ID
delive meetings export MEETING_ID --format md --purpose proofreading
delive meetings export MEETING_ID --format srt --output meeting.srt
```

`meetings export` 与回顾页共用采用稿、说话人和时间码规则。默认输出 Markdown 阅读稿。校对稿包含版本 ID、逐段正文和校对标记。待确认区段需要显式传入 `--allow-pending`。缺少有效逐句时间的稿件可以导出 Markdown 和 TXT。命令将正文写到标准输出，`--output` 写入新文件，遇到同名文件报错。

`meetings show|transcript|summary|images` 分别返回会议详情、原始及校对文本、已有摘要和图片清单。`topics`、`tags` 和 `status` 返回主题、标签和录制状态。查询输出 JSON，错误写入标准错误并返回非零退出码。
