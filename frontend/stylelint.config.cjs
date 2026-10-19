module.exports = {
  extends: ['stylelint-config-standard'],

  ignoreFiles: [
    '**/node_modules/**',
    '**/build/**',
    '**/coverage/**',
  ],

  rules: {
    /*
     * The project uses descriptive BEM-like classes and application-specific
     * custom properties rather than enforcing one naming expression.
     */
    'custom-property-pattern': null,
    'selector-class-pattern': null,

    /*
     * Prettier owns whitespace and line formatting. These rules otherwise
     * produce large amounts of noise in existing CSS and code-drawn assets.
     */
    'comment-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'declaration-block-single-line-max-declarations': null,
    'declaration-empty-line-before': null,
    'rule-empty-line-before': null,

    /*
     * Preserve readable project conventions instead of mechanically rewriting
     * valid CSS into Stylelint's preferred equivalent notation.
     */
    'alpha-value-notation': null,
    'color-function-alias-notation': null,
    'color-function-notation': null,
    'color-hex-length': null,
    'font-family-name-quotes': null,
    'import-notation': null,
    'keyframe-selector-notation': null,
    'media-feature-range-notation': null,
    'value-keyword-case': null,

    /*
     * Component styles intentionally use contextual selectors and compact
     * generated artwork. Reordering selectors merely to satisfy specificity
     * ordering can change the cascade and therefore the rendered UI.
     */
    'no-descending-specificity': null,

    /*
     * Longhand positioning is sometimes clearer for code-drawn assets.
     */
    'declaration-block-no-redundant-longhand-properties': null,

    /*
     * `clip` is retained in established visually-hidden accessibility styles,
     * and `-webkit-mask` is retained for browser compatibility.
     */
    'property-no-deprecated': null,
    'property-no-vendor-prefix': null,
  },
};
