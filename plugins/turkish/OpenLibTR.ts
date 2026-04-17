import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

const BASE_RAW = 'https://raw.githubusercontent.com/agnogad/openlibtr/main';

interface LibraryEntry {
  title: string;
  slug: string;
  chapterCount: number;
  lastUpdated: string;
}

interface ChapterEntry {
  id: number;
  title: string;
  path: string;
}

interface BookConfig {
  slug: string;
  total_chapters: number;
  chapters: ChapterEntry[];
}

class OpenLibTRPlugin implements Plugin.PluginBase {
  id = 'openlibtr';
  name = 'OpenLibTR';
  icon = 'https://raw.githubusercontent.com/agnogad/openlibtr/main/favicon.ico';
  site = 'https://github.com/agnogad/openlibtr';
  version = '1.0.0';
  filters: Filters | undefined = undefined;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const response = await fetchApi(`${BASE_RAW}/library.json`);
    const library: LibraryEntry[] = await response.json();

    // Sort: latest first if showLatestNovels, otherwise by chapterCount desc
    const sorted = [...library].sort((a, b) => {
      if (showLatestNovels) {
        return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
      }
      return b.chapterCount - a.chapterCount;
    });

    // Pagination: 20 per page
    const pageSize = 20;
    const start = (pageNo - 1) * pageSize;
    const paged = sorted.slice(start, start + pageSize);

    const novels: Plugin.NovelItem[] = paged.map(entry => ({
      name: entry.title,
      path: entry.slug,
      cover: `${BASE_RAW}/books/${entry.slug}/cover.jpg`,
    }));

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath;

    const configResponse = await fetchApi(`${BASE_RAW}/books/${slug}/config.json`);
    const config: BookConfig = await configResponse.json();

    // Also fetch library to get the title
    const libraryResponse = await fetchApi(`${BASE_RAW}/library.json`);
    const library: LibraryEntry[] = await libraryResponse.json();
    const entry = library.find(e => e.slug === slug);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: entry?.title ?? slug,
      cover: `${BASE_RAW}/books/${slug}/cover.jpg`,
      status: NovelStatus.Ongoing,
    };

    const chapters: Plugin.ChapterItem[] = config.chapters.map(ch => ({
      name: `Bölüm ${ch.id}`,
      path: `${slug}/${ch.path}`,
      releaseTime: '',
      chapterNumber: ch.id,
    }));

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // chapterPath format: "{slug}/{path}" e.g. "some-novel/ch1.md"
    const response = await fetchApi(`${BASE_RAW}/books/${chapterPath}`);
    const markdownText = await response.text();

    // Convert basic markdown to HTML for display
    const html = markdownText
      // Headers
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Bold & italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Paragraphs: double newline → paragraph break
      .replace(/\n{2,}/g, '</p><p>')
      // Single newlines → line breaks within paragraphs
      .replace(/\n/g, '<br>')
      // Wrap everything in a paragraph
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');

    return html;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const response = await fetchApi(`${BASE_RAW}/library.json`);
    const library: LibraryEntry[] = await response.json();

    const term = searchTerm.toLowerCase();
    const filtered = library.filter(entry =>
      entry.title.toLowerCase().includes(term) ||
      entry.slug.toLowerCase().includes(term),
    );

    // Pagination
    const pageSize = 20;
    const start = (pageNo - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return paged.map(entry => ({
      name: entry.title,
      path: entry.slug,
      cover: `${BASE_RAW}/books/${entry.slug}/cover.jpg`,
    }));
  }

  resolveUrl = (path: string, isNovel?: boolean) => {
    if (isNovel) {
      return `${this.site}/tree/main/books/${path}`;
    }
    // path for chapters is "{slug}/{file}"
    return `${BASE_RAW}/books/${path}`;
  };
}

export default new OpenLibTRPlugin();
