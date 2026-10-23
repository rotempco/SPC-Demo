function resolveValue(path, data)
{
    return path.split('.').reduce((obj, prop) =>
    {
        if (obj && prop in obj)
            return obj[prop];

        return undefined;
    }, data);
}

function resolveArg(arg, data, parent, root)
{
    if (arg.startsWith('$root.'))
        return resolveValue(arg.slice(6), root);

    if (arg.startsWith('../'))
        return resolveValue(arg.slice(3), parent);

    return resolveValue(arg, data);
}

function handleGaffaAttrs(result, data, parent, root)
{
    return result.replace(
        /gaffa-([\w-]+)="([^"]*)"/g,
        (match, attrName, expr) =>
        {            
            const valueMatch = expr.match(/,\s*'([^']*)'\s*$/);
            const condStr = valueMatch ? expr.slice(0, valueMatch.index) : expr;
            let attrValue = valueMatch ? valueMatch[1] : null;

            const sides = condStr.split('==').map(s => s.trim());

            let condMet = false;

            if (sides.length === 2)
            {
                const left = resolveArg(sides[0], data, parent, root);
                let right = resolveArg(sides[1], data, parent, root);

                if (!right)
                    right = sides[1];
                
                condMet = left == right;
            }
            else if (sides.length === 1 && sides[0])
            {
                condMet = Boolean(resolveArg(sides[0], data, parent, root));
                attrValue = condMet;
            }

            if (condMet)
                return attrValue !== null ? `${attrName}="${attrValue}"` : attrName;

            return '';
        }
    );
}

function handleEach(result, data, root)
{
    const openPattern = /\{\{#each\s+([\w.]+)\}\}/;

    let match;

    while ((match = openPattern.exec(result)) !== null)
    {
        const key = match[1];
        const startIndex = match.index;
        const contentStart = startIndex + match[0].length;

        let depth = 1;
        let pos = contentStart;
        let endIndex = -1;

        while (depth > 0)
        {
            const nextOpen = result.indexOf('{{#each ', pos);
            const nextClose = result.indexOf('{{/each}}', pos);

            if (nextClose === -1)
                break;

            if (nextOpen !== -1 && nextOpen < nextClose)
            {
                depth++;
                pos = nextOpen + 8;
            }
            else
            {
                depth--;

                if (depth === 0)
                    endIndex = nextClose;
                else
                    pos = nextClose + 9;
            }
        }

        if (endIndex === -1)
            break;

        const template = result.substring(contentStart, endIndex);
        const list = resolveValue(key, data);
        let output = '';

        if (Array.isArray(list))
        {
            list.forEach(item =>
            {
                const scope = Object.create(data);
                scope.$this = item;

                if (item !== null && typeof item === 'object')
                    Object.assign(scope, item);

                output += bind(template, scope, data, root);
            });
        }

        result = result.substring(0, startIndex) + output + result.substring(endIndex + 9);
    }

    return result.trim();
}

function handleIf(result, data, pattern, invert)
{
    const matches = result.matchAll(pattern);

    for (const match of matches)
    {
        const value = resolveValue(match[1], data);

        const cond = invert ? !Boolean(value) : Boolean(value);

        result = result.replace(match[0], cond ? match[2] : '');
    }

    return result.trim();
}

function handleIfEmpty(result, data, pattern)
{
    const matches = result.matchAll(pattern);

    for (const match of matches)
    {
        const value = resolveValue(match[1], data);

        const cond = !value || value.length === 0;

        result = result.replace(match[0], cond ? match[2] : '');
    }

    return result.trim();
}
function handleIfNotEmpty(result, data, pattern)
{
    const matches = result.matchAll(pattern);

    for (const match of matches)
    {
        const value = resolveValue(match[1], data);

        const cond = !value || value.length === 0;

        result = result.replace(match[0], !cond ? match[2] : '');
    }

    return result.trim();
}
function gaffaConvertTemplate(html)
{
    return html.replace(
        /<gaffa-template[^>]*>([\s\S]*?)<\/gaffa-template>/,
        (_, content) =>
            content.replace(/€€/g, '{{').replace(/££/g, '}}')
    );
}

function setCurrentYear(el)
{
    el.innerHTML = new Date().getFullYear();
}

const helpers =
{
    selected: (a, b) => a == b ? 'selected="selected"' : '',
    attr: (cond, name) => cond ? `${name}="${name}"` : ''
};

function bind(html, data, parent = null, root = null)
{
    if (!root) root = data;

    let result = html;

    result = handleEach(result, data, root);

    result = handleIf(
        result,
        data,
        /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g
    );

    result = handleIf(
        result,
        data,
        /\{\{#ifnot\s+([\w.]+)\}\}([\s\S]*?)\{\{\/ifnot\}\}/g,
        true
    );

    result = handleIfEmpty(
        result,
        data,
        /\{\{#ifempty\s+([\w.]+)\}\}([\s\S]*?)\{\{\/ifempty\}\}/g
    );

    result = handleIfNotEmpty(
        result,
        data,
        /\{\{#ifnotempty\s+([\w.]+)\}\}([\s\S]*?)\{\{\/ifnotempty\}\}/g
    );

    // gaffa-* conditional attributes
    result = handleGaffaAttrs(result, data, parent, root);

    // helper calls
    result = result.replace(
        /\{\{(\.\.\/)?@([\w]+)\(([\s\S]*?)\)\}\}/g,
        (match, parentRef, name, args) =>
        {
            const fn = helpers[name];
            
            if (!fn)
            {
                console.warn(`Helper "${name}" not found`);
                return '';
            }

            const target = parentRef ? parent : data;

            const params = args.trim() === ''
                ? []
                : args.split(',').map(a =>
                {
                    a = a.trim();

                    if (a.startsWith('$root.'))
                        return resolveValue(a.slice(6), root);

                    return resolveValue(a, target);
                });

            try
            {
                return fn(...params) ?? '';
            }
            catch (e)
            {
                xigmaticLab.logException(e, { executionContext: 'caught' });
                console.warn(`Helper ${name} failed`, e);
                return '';
            }
        });

    // variable replacement
    result = result.replace(
        /\{\{(\.\.\/)?([\w.$]+)\}\}/g,
        (match, parentRef, key) =>
        {
            let source;

            if (key.startsWith('$root.'))
            {
                source = root;
                key = key.slice(6);
            }
            else
                source = parentRef ? parent : data;

            const value = resolveValue(key, source);

            return value ?? '';
        });

    // x-required: replace with "required" when truthy, remove when falsy
    result = result.replace(
        /x-required="([^"]*)"/g,
        (match, val) => val === 'true' || val === 'True' ? 'required' : ''
    );

    return result.trim();
}

function bindList(html, data)
{
    if (!data)
        return '';

    if (!Array.isArray(data))
        data = [data];

    let out = '';

    data.forEach(item =>
    {
        if (item !== null && typeof item === 'object')
        {
            const scope = Object.create(data);
            Object.assign(scope, item);
            scope.$this = item;
            out += bind(html, scope, data, data);
        }
        else
            out += bind(html, { $this: item }, data, data);
    });

    return out.trim();
}
