Use the Archonum MCP to explore Decathlon Spain (decathlon.es) and build a complete Node.js + NPM project based on the Archonum SDK (follow the documentation in https://raw.githubusercontent.com/Archonum/archonum-sdk-js/refs/heads/main/packages/sdk/README.md) that collects and scrapes at least 1,000 products from a given product category.

Start by retrieving and inspecting the HTML of this category page using the Archonum MCP:
```
https://www.decathlon.es/es/deportes/futbol/botas
```

### 1. Product URL discovery

Create a script that:

1. Visits the category page in a new Playwright session and handles the GDPR cookie consent popup.
2. Extracts all product page URLs from the page.
3. Saves discovered URLs to a persistent, exported list on disk, ensuring all URLs are unique.
4. Discovers and visits subsequent paginated category pages, repeating the process until at least 1,000 unique product URLs have been collected.

### 2. Product data extraction

Retrieve and inspect the HTML of a representative product page using the Archonum MCP. Based on its structure, implement a second script that:

1. Reads the collected product URLs from disk.
2. Visits each product page and extracts its data using appropriate Playwright parsing logic.
3. Exports the collected product data as JSON files into a `products/` directory.

### 3. Project requirements

- Initialize a complete Node.js + NPM project with all required dependencies.
- Use the Archonum SDK for all browser sessions.
- Use a new Archonum session for each page visit.
- Prefer Playwright locators over other DOM interaction methods.
- Implement configurable concurrency for the product scraping script, defaulting to 20 simultaneous pages. URL discovery has its own configurable concurrency, defaulting to 3 listing pages at a time, and stops after the batch that reaches the target.
- Handle errors, retries, and partial failures gracefully.
- Include a concise `README.md` explaining installation, configuration, and execution.

Ensure both scripts are independently executable, work reliably, and can be run concurrently with a configurable number of workers.

## Lessons from building it

### Sessions and the site's protection
- Each page visit gets its own session, and the session is closed when the visit ends.
- Use the browser tab the gateway already provides. Don't open extra tabs.
- The gateway's browsers can be older than current ones, so avoid newer browser features.
- The site shows a bot check before some pages. Wait for it to clear for a limited time. If it doesn't clear, fail the attempt, so the retry gets a fresh device instead of waiting on a blocked one.
- Accept the cookie banner when it appears. Don't fail when it doesn't.
- Give every page visit a time limit, so a stuck visit becomes a normal, retryable failure.
- Internal browser errors should be logged and the affected visit retried, not crash the run. Other unexpected errors should still stop the run.
- Retry transient gateway errors (such as "bad gateway") after a short pause.
- Downloads are charged against the account's credits, so skip images, video and fonts. Keep the page's scripts and styles, since the page and the bot check need them. Measure the saving from the account's credit balance before and after a run.

### Reading pages
- Inspect the live page before deciding what to read, and confirm the full list is showing.
- Some lists only show part of their items at a time, and scrolling can remove the others. Read the whole list at once instead of scrolling through it.
- Read single fields (titles, prices, labels) directly from their elements.
- Don't rely on the structured data embedded in product pages. It holds only a few basic fields. Read the visible page section by section: specifications, sizes, delivery, assurances, features and care instructions.
- Some sections open only when clicked. Open them, read them, and close them before moving on.
- Check that an optional section exists before reading it, so a missing section doesn't stall the scrape.

### Discovery and URLs
- Follow the site's own pagination, and stop at the last page or when the target is reached.
- Each country's site has its own domain and language in its addresses. Take both from the category address the user gives, rather than writing them into the code, so the same tool works for every country site. Accept only the site's own domains, so the tool can't be pointed at arbitrary sites.
- Treat two addresses as the same product when they differ only in tracking parameters. Make sure the address pattern covers every kind of product the site lists, including marketplace sellers. A pattern that is too strict drops products silently, so test it against real links.
- A listing page with too few items is incomplete. Retry it instead of saving partial results. The last page may be short.
- Save progress after every page or product, so a rerun continues where it stopped and only fetches what's missing.
- Remove a stale list from an earlier, partial run before a clean rerun.

### Output
- Name each product file with an identifier that's unique to that product. Short codes can repeat across products.
- Skip products that already have output, unless a force option is given.
- Record failures with their address and error in a separate file, so they can be retried later.

### Configuration and safety
- Make concurrency, the target count, retry attempts and other limits configurable through options and environment variables, with the defaults in the brief.
- The Archonum token lives only in the `ARCHONUM_API_TOKEN` environment variable. Never write it into project files. Keep token-bearing files (such as the MCP configuration and env files) out of version control, but commit the collected data.
- The project has no automated test suite. Verify changes with small live runs (for example with limits on pages or products) and check the output.
