var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "typedoc/dist/lib/models/reflections/abstract", "typedoc/dist/lib/models/reflections/declaration", "typedoc/dist/lib/converter/components", "typedoc/dist/lib/converter/converter", "typedoc/dist/lib/converter/plugins/CommentPlugin", "./getRawComment"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const abstract_1 = require("typedoc/dist/lib/models/reflections/abstract");
    const declaration_1 = require("typedoc/dist/lib/models/reflections/declaration");
    const components_1 = require("typedoc/dist/lib/converter/components");
    const converter_1 = require("typedoc/dist/lib/converter/converter");
    const CommentPlugin_1 = require("typedoc/dist/lib/converter/plugins/CommentPlugin");
    const getRawComment_1 = require("./getRawComment");
    /**
     * This plugin allows an ES6 module to specify its TypeDoc name.
     * It also allows multiple ES6 modules to be merged together into a single TypeDoc module.
     *
     * @usage
     * At the top of an ES6 module, add a "dynamic module comment".  Insert "@module typedocModuleName" to
     * specify that this ES6 module should be merged with module: "typedocModuleName".
     *
     * Similar to the [[DynamicModulePlugin]], ensure that there is a comment tag (even blank) for the
     * first symbol in the file.
     *
     * @example
     * ```
     *
     * &#47;**
     *  * @category newModuleName
     *  *&#47;
     * &#47;** for typedoc &#47;
     * import {foo} from "../foo";
     * export let bar = "bar";
     * ```
     *
     * Also similar to [[DynamicModulePlugin]], if @preferred is found in a dynamic module comment, the comment
     * will be used as the module comment, and documentation will be generated from it (note: this plugin does not
     * attempt to count lengths of merged module comments in order to guess the best one)
     */
    let ExternalModuleNamePlugin = class ExternalModuleNamePlugin extends components_1.ConverterComponent {
        initialize() {
            this.listenTo(this.owner, {
                [converter_1.Converter.EVENT_BEGIN]: this.onBegin,
                [converter_1.Converter.EVENT_CREATE_DECLARATION]: this.onDeclaration,
                [converter_1.Converter.EVENT_RESOLVE_BEGIN]: this.onBeginResolve,
            });
        }
        /**
         * Triggered when the converter begins converting a project.
         *
         * @param context  The context object describing the current state the converter is in.
         */
        onBegin(context) {
            this.moduleRenames = [];
        }
        /**
         * Triggered when the converter has created a declaration reflection.
         *
         * @param context  The context object describing the current state the converter is in.
         * @param reflection  The reflection that is currently processed.
         * @param node  The node that is currently processed if available.
         */
        onDeclaration(context, reflection, node) {
            if (reflection.kindOf(abstract_1.ReflectionKind.ExternalModule)) {
                let comment = getRawComment_1.getRawComment(node);
                // Look for @category
                let match = /@category\s+([\w\u4e00-\u9fa5\.\-_/@"]+)/.exec(comment);
                if (match) {
                    // Look for @preferred
                    let preferred = /@preferred/.exec(comment);
                    // Set up a list of renames operations to perform when the resolve phase starts
                    this.moduleRenames.push({
                        renameTo: match[1],
                        preferred: preferred != null,
                        reflection: reflection,
                    });
                }
            }
            if (reflection.comment) {
                CommentPlugin_1.CommentPlugin.removeTags(reflection.comment, 'category');
                CommentPlugin_1.CommentPlugin.removeTags(reflection.comment, 'preferred');
            }
        }
        /**
         * Triggered when the converter begins resolving a project.
         *
         * @param context  The context object describing the current state the converter is in.
         */
        onBeginResolve(context) {
            let projRefs = context.project.reflections;
            let refsArray = Object.keys(projRefs).reduce((m, k) => {
                m.push(projRefs[k]);
                return m;
            }, []);
            // Process each rename
            this.moduleRenames.forEach(item => {
                let renaming = item.reflection;
                // Find or create the module tree until the child's parent (each level is separated by .)
                let nameParts = item.renameTo.split('.');
                let parent = context.project;
                for (let i = 0; i < nameParts.length - 1; ++i) {
                    let child = parent.children.filter(ref => ref.name === nameParts[i])[0];
                    if (!child) {
                        child = new declaration_1.DeclarationReflection(parent, nameParts[i], abstract_1.ReflectionKind.ExternalModule);
                        child.parent = parent;
                        child.children = [];
                        context.project.reflections[child.id] = child;
                        parent.children.push(child);
                    }
                    parent = child;
                }
                // Find an existing module with the child's name in the last parent. Use it as the merge target.
                let mergeTarget = (parent.children.filter(ref => ref.kind === renaming.kind && ref.name === nameParts[nameParts.length - 1])[0]);
                // If there wasn't a merge target, change the name of the current module, connect it to the right parent and exit.
                if (!mergeTarget) {
                    renaming.name = nameParts[nameParts.length - 1];
                    let oldParent = renaming.parent;
                    for (let i = 0; i < oldParent.children.length; ++i) {
                        if (oldParent.children[i] === renaming) {
                            oldParent.children.splice(i, 1);
                            break;
                        }
                    }
                    item.reflection.parent = parent;
                    parent.children.push(renaming);
                    return;
                }
                if (!mergeTarget.children) {
                    mergeTarget.children = [];
                }
                // Since there is a merge target, relocate all the renaming module's children to the mergeTarget.
                let childrenOfRenamed = refsArray.filter(ref => ref.parent === renaming);
                childrenOfRenamed.forEach((ref) => {
                    // update links in both directions
                    ref.parent = mergeTarget;
                    mergeTarget.children.push(ref);
                });
                // If @preferred was found on the current item, update the mergeTarget's comment
                // with comment from the renaming module
                if (item.preferred)
                    mergeTarget.comment = renaming.comment;
                // Now that all the children have been relocated to the mergeTarget, delete the empty module
                // Make sure the module being renamed doesn't have children, or they will be deleted
                if (renaming.children)
                    renaming.children.length = 0;
                CommentPlugin_1.CommentPlugin.removeReflection(context.project, renaming);
                // Remove @category and @preferred from the comment, if found.
                CommentPlugin_1.CommentPlugin.removeTags(mergeTarget.comment, 'category');
                CommentPlugin_1.CommentPlugin.removeTags(mergeTarget.comment, 'preferred');
            });
        }
    };
    ExternalModuleNamePlugin = __decorate([
        components_1.Component({ name: 'external-module-name' })
    ], ExternalModuleNamePlugin);
    exports.ExternalModuleNamePlugin = ExternalModuleNamePlugin;
});
