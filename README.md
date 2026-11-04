# Decathlon product scraper

Collects at least 1,000 unique product URLs from a Decathlon category, then visits each product page and saves its details as a JSON file. Browser sessions come from the [Archonum](https://app.archonum.com) gateway through the [Archonum SDK](https://github.com/Archonum/archonum-sdk-js).

Default category: `https://www.decathlon.es/es/deportes/futbol/botas`

### Other countries

The scraper works on any Decathlon country site. Pass a category URL from that site with `--category` (or `CATEGORY_URL`), and the scripts use that domain and its language path throughout:

```bash
npm run discover -- --category=https://www.decathlon.fr/fr/sports/football/chaussures
npm run discover -- --category=https://www.decathlon.co.uk/football/boots
```

Accepted domains are `decathlon.<country>` (for example `.es`, `.fr`, `.it`, `.de`, `.pt`, `.co.uk`, `.com.br`). Anything else is rejected. Use a separate `data/product-urls.json` for each country: discover refuses to mix categories in one file. Layouts and bot checks differ between country sites, so test a small run (`--target=40`) before a full one.

## How this project was built

The project was generated with an AI coding assistant. [`CLAUDE.md`](CLAUDE.md) is the brief it worked from, and it's the place to start if you want to rebuild or extend the project:

1. **Brief:** the top of `CLAUDE.md` lists the requirements: two scripts, a persistent URL list, one JSON file per product, a session per page visit, configurable concurrency, and a README.
2. **Inspect first:** the assistant used the Archonum MCP to look at the category page and a product page before writing any extraction code.
3. **Build discovery, then scraping:** each script was built and checked against the live site with small limits before running it at full size.
4. **Lessons:** the "Lessons from building it" section records what went wrong during the build (bot checks, shared browser tabs, virtualized lists, bandwidth) and how each problem was handled. Read it before changing the scraping logic.

To rebuild from `CLAUDE.md`, give it to an assistant in an empty folder with the [Archonum MCP](https://app.archonum.com/docs/#mcp) connected, and ask it to follow the brief.

## Archonum setup

1. Create an account at [app.archonum.com/register](https://app.archonum.com/register).
2. Open the **API Key** page and copy your token.
3. Make the token available to the scripts, either as an environment variable or in a `.env` file in this folder:

   ```bash
   # PowerShell
   $env:ARCHONUM_API_TOKEN = "your-token"

   # bash
   export ARCHONUM_API_TOKEN="your-token"
   ```

   Or copy `.env.example` to `.env` and fill in the token. Real environment variables take precedence over `.env`.

Keep the token out of files you share or commit. `.env` is listed in `.gitignore`.

## Installation

Requires Node.js 18 or later.

```bash
npm install
```

The browser runs on the Archonum gateway, so no local browser download is needed.

## Running the scripts

Run the two steps in order. The first collects product URLs, the second scrapes them.

```bash
# 1. Collect product URLs into data/product-urls.json
npm run discover

# 2. Scrape the URLs into products/*.json
npm run scrape
```

Pass options after `--`, so npm forwards them to the script:

```bash
npm run discover -- --target=1200 --concurrency=5
npm run scrape -- --concurrency=10 --limit=50
npm run scrape -- --force
```

If you're on Windows PowerShell and options are ignored (npm warns about "Unknown cli config"), run the script directly instead:

```bash
node src/scrape-products.js --concurrency=10 --limit=50
```

### Options

| Option            | Environment variable | Default        | Meaning                                                     |
| ----------------- | -------------------- | -------------- | ----------------------------------------------------------- |
| `--target=N`      | `TARGET_URLS`        | `1000`         | Unique product URLs to collect (discover)                   |
| `--category=URL`  | `CATEGORY_URL`       | botas category | An `https` category URL on any `decathlon.<country>` site   |
| `--max-pages=N`   |                      | `200`          | Safety cap on listing pages (discover)                      |
| `--concurrency=N` | `DISCOVER_CONCURRENCY` | `3`          | Listing pages visited in parallel, 1–50 (discover)          |
| `--concurrency=N` | `CONCURRENCY`        | `20`           | Product pages visited in parallel, 1–50 (scrape)            |
| `--limit=N`       |                      | all            | Scrape only the first N URLs (scrape)                       |
| `--attempts=N`    | `MAX_ATTEMPTS`       | `5`            | Attempts per page before it is recorded as failed           |
| `--force`         |                      | off            | Scrape again even if a product file already exists (scrape) |
|                   | `BLOCK_ASSETS`       | on             | Set to `0` to load images, media and fonts                  |

**Discover concurrency.** `--concurrency` on discover sets how many listing pages are read at once. The default is 3.

- Higher values finish faster, because session setup and page loads overlap.
- Discover stops starting new pages once the target is reached, but the pages already in flight finish. So with `N` workers it can overshoot the target by up to `N − 1` pages (about 40 links each, fewer after duplicates are removed).
- Higher values also make the shared browser tab more likely to be taken over by another session (see Troubleshooting). Keep the default unless the runs are reliable at a higher value.
- Set it per run with `npm run discover -- --concurrency=5`, or for every run with the `DISCOVER_CONCURRENCY` environment variable. It doesn't change the scrape step, which has its own `CONCURRENCY` setting.

Discover and scrape can run at the same time. Scrape reads `data/product-urls.json`, which discover rewrites after every listing page.

## Project structure

```
decathlon-test/test/
├── CLAUDE.md                   the brief and lessons the project was built from
├── README.md                   this file
├── package.json                scripts and dependencies
├── .env.example                template for the Archonum token
├── src/
│   ├── discover-urls.js        step 1: collects product URLs from the category
│   ├── scrape-products.js      step 2: scrapes each product page
│   ├── config.js               defaults, options and their validation
│   └── lib/
│       ├── archonum-session.js opens one Archonum browser session per page visit
│       ├── bot-wall.js         waits for bot-protection checks to clear
│       ├── cookies.js          accepts the cookie banner when it appears
│       ├── listing.js          reads a category page: product URLs and pagination
│       ├── product-page.js     reads a product page: all its sections
│       ├── product-parser.js   turns the raw values into the saved record
│       ├── url-utils.js        product and listing URL rules
│       ├── store.js            saves JSON files safely and keeps the URL list
│       ├── pool.js             runs a fixed number of pages at once
│       └── runtime.js          client setup, logging, error handling
├── data/                       created by the scripts (committed)
└── products/                   created by the scrape step (committed)
```

## Data produced

### `data/product-urls.json`

The list of product URLs for one category. Discover reads it on startup, so an interrupted run continues from where it stopped.

| Field            | Meaning                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `category`       | The category URL the list belongs to                              |
| `updatedAt`      | When the file was last saved                                      |
| `totalPages`     | Number of listing pages the category has, as reported by the site |
| `completedPages` | Listing pages that were read successfully                         |
| `failedPages`    | Listing pages that failed, with the error and time                |
| `urls`           | The unique product URLs, in the order they were found             |

### `products/<productId>_<variant>.json`

One file per product, for example `products/386707_m9030752.json`. The name combines the product ID and the variant code, because variant codes alone can repeat across products.

| Field                                         | Meaning                                                      |
| --------------------------------------------- | ------------------------------------------------------------ |
| `url`, `productKey`, `variantId`, `productId` | Where the product came from and its identifiers              |
| `name`, `brand`, `description`                | Basic product information                                    |
| `stickers`                                    | Labels such as "Novedad"                                     |
| `breadcrumbs`                                 | The category path shown on the page                          |
| `price`                                       | Current price with currency                                  |
| `originalPrice`                               | Previous price, when the page shows one                      |
| `financing`                                   | Monthly payment option, when shown                           |
| `sizes`                                       | Available sizes                                              |
| `colors`                                      | Colour options, each with `name`, `selected` and `available` |
| `delivery`                                    | Delivery options, each with `method` and `status`            |
| `soldBy`                                      | The seller line shown on the page                            |
| `assurances`                                  | Return and warranty information                              |
| `features`                                    | The feature cards, each with a `title` and `text`            |
| `specifications`                              | Specification groups, each with its name/value items         |
| `careAndUse`                                  | Care instructions, as text, when the sheet opens             |
| `images`                                      | Image URLs (the images themselves are not downloaded)        |
| `sourceCategory`                              | The category the URL list came from                          |
| `scrapedAt`                                   | When the page was read                                       |

Some fields can be `null` or empty when the page doesn't show them, for example `colors` on single-colour products.

### `data/failed-products.json`

Products that failed in the most recent scrape run, with their URL, error and time. Run `npm run scrape` again to retry them. Products already saved are skipped.
