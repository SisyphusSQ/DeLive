# Topics & Tags

## Topics

Topics are project-like containers for organizing recording sessions.

### Creating a Topic

1. Open the **Topics** tab from the navigation bar
2. Click **Create Topic**
3. Enter a name, choose an emoji icon, and optionally add a description

![Topics View](/images/screenshot-topics-view.png)

### Recording into a Topic

Two ways to associate a recording with a topic:

- **From the topic card** — click **Record New** on a topic card, which opens the Live view with the topic pre-selected
- **From the Live view** — click the **Select Topic** link above the recording controls and pick a topic

The selected topic appears as a badge above the record button, and recordings are automatically assigned.

### Managing Sessions in Topics

- Review includes all sessions, with their topic shown in both the main list and detail sidebar. Topics are filtered views of the same records.
- Use the topic selector beneath the session title to assign or directly change a topic. Choose **Uncategorized** or **Remove from Topic** to remove its association. Failed saves show an error and retain the previous topic.
- If no topics exist, create one in Topics first. Grouping does not copy or migrate recordings, text, or transcript versions.
- Deleting a topic removes the association but does not delete the sessions

## Tags

Tags provide lightweight cross-cutting labels for sessions.

### Using Tags

- Create tags with a name and color (from preset Tailwind color palettes)
- Assign tags to sessions from the Review Desk Overview tab
- Filter sessions by tag in the History view
- AI can suggest tags during post-processing — apply them with one click

### Preset Colors

Tags use a set of predefined color bundles with `name`, `bg`, `text`, and `border` classes for consistent visual appearance across light and dark themes.

## Backup & Import

- **Export** saves all sessions, tags, and settings (except topics) to a JSON file
- **Import** can either **overwrite** all data or **merge** (only new sessions and tags are added)
- Topics are stored in localStorage and are not included in backup files
