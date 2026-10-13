import { aggregateRating, image, party } from './shared.ts';
import { define, field, OPT, REC, REQ } from './shape.ts';

const ANSWER = define('Answer', 'Answer', [field('text', 'Answer', '', 'text', REC)]);

const QUESTION = define('Question', 'Question', [
  field('name', 'Question', '', 'text', REC),
  field('acceptedAnswer', 'Answer', '', 'item', REC, { nested: { Answer: 'Answer' } }),
]);

const HOW_TO_STEP = define('HowToStep', 'Step', [
  field('text', 'What to do', '', 'text', REQ),
  field('name', 'Short title', '', 'text', REC),
  field('url', 'Link to this step', '', 'url', REC),
  image(REC),
]);

const NUTRITION = define('NutritionInformation', 'Nutrition', [
  field('calories', 'Calories', 'Such as 270 calories. Needs a yield as well.', 'text', REC),
]);

const ARTICLE = define(
  'Article',
  'Article',
  [
    field('headline', 'Headline', '', 'text', REC),
    image(REC),
    field(
      'datePublished',
      'Published',
      'With the time zone, such as 2026-10-13T08:00:00+00:00.',
      ['dateTime', 'date'],
      REC,
    ),
    field('dateModified', 'Last changed', '', ['dateTime', 'date'], REC),
    party('author', 'Author', 'One entry for each author.', REC, { repeats: true }),
    field('description', 'Summary', '', 'text', OPT),
    party('publisher', 'Publisher', '', OPT, { nested: { Organization: 'Party.Organization' } }),
    field(
      'mainEntityOfPage',
      'Page address',
      'The address of the page the article is on.',
      'url',
      OPT,
    ),
  ],
  { variants: ['BlogPosting', 'NewsArticle'] },
);

const FAQ_PAGE = define(
  'FAQPage',
  'FAQ page',
  [
    field('mainEntity', 'Questions', '', 'item', REC, {
      repeats: true,
      nested: { Question: 'Question' },
    }),
  ],
  {
    note: 'Google stopped showing FAQ results in 2026. The markup is still valid Schema.org and other readers use it.',
  },
);

const RECIPE = define('Recipe', 'Recipe', [
  field('name', 'Name of the dish', '', 'text', REQ),
  image(REQ),
  field('description', 'Description', '', 'text', REC),
  party('author', 'Author', '', REC),
  field('datePublished', 'Published', '', 'date', REC),
  field('prepTime', 'Preparation time', 'As a duration: PT20M is twenty minutes.', 'text', REC),
  field('cookTime', 'Cooking time', 'As a duration: PT1H30M is an hour and a half.', 'text', REC),
  field('totalTime', 'Total time', 'As a duration.', 'text', REC),
  field('recipeYield', 'Makes', 'Such as 4 servings.', 'text', REC),
  field('recipeCategory', 'Kind of dish', 'Such as dinner or dessert.', 'text', REC),
  field('recipeCuisine', 'Cuisine', 'Such as French or Mexican.', 'text', REC),
  field('keywords', 'Keywords', 'Separated by commas.', 'text', REC),
  field('recipeIngredient', 'Ingredients', 'One entry for each ingredient.', 'text', REC, {
    repeats: true,
  }),
  field('recipeInstructions', 'Steps', 'One entry for each step.', ['item', 'text'], REC, {
    repeats: true,
    nested: { HowToStep: 'HowToStep' },
  }),
  field('nutrition', 'Nutrition', '', 'item', REC, {
    nested: { NutritionInformation: 'NutritionInformation' },
  }),
  aggregateRating(REC),
]);

export const CONTENT = [ANSWER, QUESTION, HOW_TO_STEP, NUTRITION, ARTICLE, FAQ_PAGE, RECIPE];
