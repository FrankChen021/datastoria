# Icon Reference Guide for VitePress Documentation

This guide shows how to use icons in your VitePress markdown documentation.

## Method 1: Iconify Icons (Recommended)

VitePress supports Iconify icons. Use them with HTML syntax:

### Basic Syntax

```html
<!-- Material Design Icons -->
<i class="i-mdi-icon-name"></i>

<!-- Lucide Icons -->
<i class="i-lucide-icon-name"></i>
```

### Common Icons for DataStoria

#### Database & Connection Icons
```markdown
<i class="i-mdi-database"></i> Database
<i class="i-mdi-database-check"></i> Connection Active
<i class="i-mdi-database-remove"></i> Disconnect
<i class="i-mdi-server-network"></i> Cluster
```

#### Query & SQL Icons
```markdown
<i class="i-mdi-code-tags"></i> SQL Editor
<i class="i-mdi-play"></i> Run Query
<i class="i-mdi-code-json"></i> Query Results
<i class="i-mdi-chart-line"></i> Query Performance
```

#### AI & Chat Icons
```markdown
<i class="i-mdi-robot"></i> AI Features
<i class="i-mdi-chat"></i> Chat
<i class="i-mdi-sparkles"></i> Natural Language
<i class="i-mdi-auto-fix"></i> Query Optimization
```

#### Visualization Icons
```markdown
<i class="i-mdi-chart-bar"></i> Bar Chart
<i class="i-mdi-chart-pie"></i> Pie Chart
<i class="i-mdi-chart-line"></i> Line Chart
<i class="i-mdi-chart-scatter-plot"></i> Scatter Plot
```

#### Navigation & UI Icons
```markdown
<i class="i-mdi-menu"></i> Menu
<i class="i-mdi-cog"></i> Settings
<i class="i-mdi-magnify"></i> Search
<i class="i-mdi-folder"></i> Schema Explorer
```

### Lucide Icons (Alternative)

Lucide icons have a cleaner, more modern look. Use the same syntax with `lucide-` prefix:

#### Database & Connection Icons (Lucide)
```markdown
<i class="i-lucide-database"></i> Database
<i class="i-lucide-database-check"></i> Connection Active
<i class="i-lucide-server"></i> Server
<i class="i-lucide-network"></i> Cluster
```

#### Query & SQL Icons (Lucide)
```markdown
<i class="i-lucide-code"></i> SQL Editor
<i class="i-lucide-play"></i> Run Query
<i class="i-lucide-file-code"></i> Query Results
<i class="i-lucide-trending-up"></i> Query Performance
```

#### AI & Chat Icons (Lucide)
```markdown
<i class="i-lucide-bot"></i> AI Features
<i class="i-lucide-message-square"></i> Chat
<i class="i-lucide-sparkles"></i> Natural Language
<i class="i-lucide-wand-2"></i> Query Optimization
```

#### Visualization Icons (Lucide)
```markdown
<i class="i-lucide-bar-chart-3"></i> Bar Chart
<i class="i-lucide-pie-chart"></i> Pie Chart
<i class="i-lucide-line-chart"></i> Line Chart
<i class="i-lucide-scatter-chart"></i> Scatter Plot
```

#### Navigation & UI Icons (Lucide)
```markdown
<i class="i-lucide-menu"></i> Menu
<i class="i-lucide-settings"></i> Settings
<i class="i-lucide-search"></i> Search
<i class="i-lucide-folder"></i> Schema Explorer
<i class="i-lucide-plus"></i> Add
<i class="i-lucide-edit"></i> Edit
<i class="i-lucide-trash-2"></i> Delete
<i class="i-lucide-check"></i> Save/Confirm
```

### Examples in Text

```markdown
Click the <i class="i-mdi-chat"></i> chat icon to open the AI assistant.

Navigate to <i class="i-mdi-database"></i> **Connections** in the sidebar.

Use the <i class="i-mdi-play"></i> **Run** button to execute your query.
```

### With Styling

```html
<span style="display: inline-flex; align-items: center; gap: 4px;">
  <i class="i-mdi-database" style="font-size: 18px; color: #3b82f6;"></i>
  <strong>Database Connection</strong>
</span>
```

## Method 2: Custom SVG Icons

### Place SVG files in `docs/public/icons/`

```markdown
![Database Icon](/icons/database.svg)
```

### Inline SVG

```html
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M4 7h16M4 12h16M4 17h16"/>
</svg>
```

## Method 3: Emoji (Simple Alternative)

```markdown
🔍 Search | 💬 Chat | 📊 Dashboard | ⚙️ Settings | 🤖 AI
```

## Finding Icons

### Iconify Icon Sets

Visit [icones.js.org](https://icones.js.org) to browse available icons:

- **Material Design Icons**: `mdi-*` (most comprehensive, 7000+ icons)
- **Lucide**: `lucide-*` (modern, clean, consistent style - **Recommended for DataStoria**)
- **Heroicons**: `heroicons-*` (simple, elegant)
- **Tabler Icons**: `tabler-*` (consistent style)

### Usage Pattern

1. Search for an icon on [icones.js.org](https://icones.js.org)
2. Select the **Lucide** icon set (or Material Design)
3. Copy the icon name (e.g., `lucide-database` or `mdi-database`)
4. Use in markdown: 
   - Lucide: `<i class="i-lucide-database"></i>`
   - Material: `<i class="i-mdi-database"></i>`

## Best Practices

1. **Consistency**: Use the same icon set throughout your documentation
2. **Size**: Keep icons small (16-20px) for inline use
3. **Accessibility**: Always provide text alongside icons
4. **Color**: Use CSS to match your theme colors
5. **Spacing**: Add small gaps between icons and text

## Examples for DataStoria Documentation

### Feature List with Icons

```markdown
- <i class="i-mdi-robot"></i> **AI-Powered**: Natural language to SQL conversion
- <i class="i-mdi-chart-line"></i> **Visualization**: Intelligent chart generation
- <i class="i-mdi-server-network"></i> **Multi-Cluster**: Manage multiple ClickHouse clusters
- <i class="i-mdi-shield-lock"></i> **Privacy**: 100% local execution
```

### Step-by-Step Instructions

```markdown
1. Click the <i class="i-mdi-database"></i> database icon in the sidebar
2. Select <i class="i-mdi-plus"></i> **Add Connection**
3. Enter your connection details
4. Click <i class="i-mdi-check"></i> **Test Connection**
```

### Button References

```markdown
Click the <i class="i-mdi-play"></i> **Run** button to execute your query.

Use the <i class="i-mdi-content-save"></i> **Save** button to store your query.

The <i class="i-mdi-delete"></i> **Delete** button removes the connection.
```

## Troubleshooting

### Icons Not Showing

1. **Check icon name**: Ensure the icon exists in the Iconify collection
2. **Verify syntax**: Use `<i class="i-mdi-icon-name"></i>` format
3. **Clear cache**: Restart the VitePress dev server

### Styling Issues

```html
<!-- Add custom styling -->
<i class="i-mdi-icon-name" style="color: #3b82f6; font-size: 20px;"></i>
```

---

*For more icon options, visit [icones.js.org](https://icones.js.org)*
