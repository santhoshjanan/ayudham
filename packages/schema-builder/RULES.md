# Where the guided types' levels come from

Each guided type marks its fields required, recommended or optional. The levels are taken from
Google Search Central's structured data documentation, read on **2026-10-13**. That date is
exported as `RULES_CHECKED` and shown on the builder's page. When you re-read the sources,
change the levels, this file and `RULES_CHECKED` together.

Meeting these levels does not guarantee a search result of any kind.

| Guided type | Source | Source last updated |
|---|---|---|
| Organization | https://developers.google.com/search/docs/appearance/structured-data/organization | 2026-09-08 |
| LocalBusiness | https://developers.google.com/search/docs/appearance/structured-data/local-business | 2026-09-08 |
| WebSite | https://developers.google.com/search/docs/appearance/site-names | 2025-12-10 |
| BreadcrumbList | https://developers.google.com/search/docs/appearance/structured-data/breadcrumb | 2026-09-08 |
| Article, BlogPosting, NewsArticle | https://developers.google.com/search/docs/appearance/structured-data/article | 2026-09-08 |
| FAQPage | None. Google removed its FAQ documentation on 2026-06-15 and no longer shows the result. | |
| Product | https://developers.google.com/search/docs/appearance/structured-data/product-snippet | 2026-09-08 |
| Event | https://developers.google.com/search/docs/appearance/structured-data/event | 2026-09-08 |
| Person | None. Google documents no result for a person on their own. | |
| Recipe | https://developers.google.com/search/docs/appearance/structured-data/recipe | 2026-09-08 |
| AggregateRating, Review, Rating | https://developers.google.com/search/docs/appearance/structured-data/review-snippet | 2026-09-08 |

## What the sources say

- **Organization.** Nothing required. Recommended: `name`, `url`, `logo`, `description`,
  `alternateName`, `legalName`, `email`, `telephone`, `address` (with `streetAddress`,
  `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`), `contactPoint` (with
  `telephone`, `email`), `sameAs`, `foundingDate`, and identifiers (`taxID`, `vatID`,
  `iso6523Code`, `naics`, `globalLocationNumber`, `duns`, `leiCode`), plus `numberOfEmployees`,
  `hasMerchantReturnPolicy`, `hasMemberProgram` and `hasShippingService`.
- **LocalBusiness.** Required: `name`, `address`. Recommended: `url`, `telephone`, `priceRange`,
  `geo` (`latitude`, `longitude`), `openingHoursSpecification` (`dayOfWeek`, `opens`, `closes`,
  `validFrom`, `validThrough`), `menu`, `servesCuisine`, `department`, and `aggregateRating` and
  `review` for sites that collect reviews of other businesses.
- **WebSite.** Required: `name`, `url`. Recommended: `alternateName`. Home page only.
- **BreadcrumbList.** Required: `itemListElement`, and on each `ListItem`: `name`, `position`,
  `item`. `item` may be left off the last step.
- **Article.** Nothing required. Recommended: `headline`, `image`, `datePublished`,
  `dateModified`, `author` (with `name`, `url`).
- **Product.** Required: `name`, and one of `offers`, `aggregateRating`, `review`. On an `Offer`:
  `price` required; `priceCurrency`, `availability`, `priceValidUntil` recommended.
- **Event.** Required: `name`, `startDate`, `location` and `location.address`. Recommended:
  `location.name`, `endDate`, `eventStatus`, `description`, `image`, `organizer` (`name`, `url`),
  `performer` (`name`), `offers` (`price`, `priceCurrency`, `availability`, `validFrom`, `url`),
  and `previousStartDate` for a rescheduled event. Physical events only.
- **Recipe.** Required: `name`, `image`. Recommended: `description`, `author`, `datePublished`,
  `prepTime`, `cookTime`, `totalTime`, `recipeYield`, `recipeCategory`, `recipeCuisine`,
  `keywords`, `recipeIngredient`, `recipeInstructions` (each `HowToStep`: `text` required; `name`,
  `url`, `image` recommended), `nutrition.calories`, `aggregateRating`, `video`.
- **AggregateRating.** Required: `ratingValue`, and one of `ratingCount`, `reviewCount`.
  Recommended: `bestRating`, `worstRating`. The scale is 1 to 5 unless stated.
- **Review.** Required: `author`, `reviewRating` with `ratingValue`. Recommended:
  `datePublished`, `bestRating`, `worstRating`.

## Where the definitions differ, on purpose

- **Identifiers on Organization** (`taxID`, `vatID`, `iso6523Code`, `naics`,
  `globalLocationNumber`, `duns`, `leiCode`) are optional, not recommended. Most organizations
  publish none of them, and seven standing reminders would bury the useful ones.
- **Not guided fields**, though the sources list them; they stay reachable through "Add another
  property": `numberOfEmployees`, `hasMerchantReturnPolicy`, `hasMemberProgram`,
  `hasShippingService` (Organization); `department`, `aggregateRating`, `review` (LocalBusiness);
  `video` (Recipe). `menu` and `servesCuisine` are not properties of `LocalBusiness` itself in
  Schema.org, only of `FoodEstablishment`, so they appear when that type is chosen.
- **Seasonal opening hours** (`validFrom`, `validThrough`) are optional. They apply only to
  hours that change through the year.
- **The last breadcrumb's address** is why `item` is recommended and not required.
  `position` is not a field at all: the output numbers the steps.
- **Ratings and reviews on Product** are optional, and `offers` is recommended. The one-of rule
  still requires one of the three. Recommending ratings to everyone would invite invented ones.
- **FAQPage and Person** have no source, so nothing is required. Their recommended fields are
  this project's judgement of what makes the markup useful: questions with answers for
  `FAQPage`; `name`, `url`, `image`, `jobTitle`, `worksFor` and `sameAs` for `Person`.
