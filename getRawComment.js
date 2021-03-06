/**
 * Monkey patches getJSDocCommentRanges to make `getRawComment` return a
 * comment for a module even if there is only one comment
 *
 * @see https://github.com/christopherthielen/typedoc-plugin-external-module-name/issues/6
 * @see https://github.com/TypeStrong/typedoc/blob/master/src/lib/converter/factories/comment.ts
 */
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "typedoc/dist/lib/ts-internal", "typedoc/dist/lib/converter/factories/comment"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const _ts = require("typedoc/dist/lib/ts-internal");
    const comment_1 = require("typedoc/dist/lib/converter/factories/comment");
    function monkeyPatch() {
        const realGetJSDocCommentRanges = _ts.getJSDocCommentRanges;
        function patchedGetJSDocCommentRanges() {
            const result = realGetJSDocCommentRanges.apply(this, arguments);
            if (result && result.length === 1) {
                result.push(null);
            }
            return result;
        }
        const tsinternal = _ts;
        tsinternal.getJSDocCommentRanges = patchedGetJSDocCommentRanges;
        return function unMonkeyPatch() {
            tsinternal.getJSDocCommentRanges = realGetJSDocCommentRanges;
        };
    }
    function getRawComment(node) {
        let unpatch = monkeyPatch();
        try {
            return comment_1.getRawComment(node);
        }
        finally {
            unpatch();
        }
    }
    exports.getRawComment = getRawComment;
});
