(function () {
    let bindings = {};
    let uniqueId = 0;
    const templateLoads = new WeakMap();
    const bindingReads = new WeakMap();

    function geturlParameters(address) {
        var urlParameters = {};
        var queryIndex = (address + "").indexOf("?");

        if (address.indexOf('#') > 0)
            address = address.substr(0, address.indexOf('#'));

        if (queryIndex > 0) {
            var parameters = new URLSearchParams(address.substring(queryIndex));
            var entries = parameters.entries();
            for (const entry of entries) {
                urlParameters[entry[0]] = entry[1];
            }
        }

        return urlParameters;
    }

    function bindUrlParameters(url) {
        var urlParameters = geturlParameters(window.location.href);

        const urlElements = [...url.matchAll(/\[([^\]]+)\]/g)];
        urlElements.forEach(urlElement => {
            const token = urlElement[0];
            const key = urlElement[1];

            const value = urlParameters[key];

            if (value !== undefined && value !== null) {
                url = url.replace(token, value);
            }
        });

        return url;
    }

    async function get(url, options = {}) {
        
        var result = await fetch(url, { signal: options.signal });
        if (result.ok) {
            var resultText = await result.text();
            if (resultText)
                return JSON.parse(resultText);
            else
                return {};
        }
        else if (options.toast !== false)
            xigmaticLab.toastFailTT('Request failed');

        return null;
    }


    async function deleteCall(url) {
        url = bindUrlParameters(url);

        var result = await fetch(url, {
            headers: {
                "content-type": "application/json",
                "X-CSRF-TOKEN": xigmaticLab.getCsrfToken()
            }, method: 'DELETE'
        });
        if (result.ok)
            return true;

        let errorText = 'Request failed';
        try {
            const responseText = await result.text();
            if (responseText) {
                try {
                    const parsed = JSON.parse(responseText);
                    errorText = parsed?.detail || parsed?.message || parsed?.title || responseText;
                }
                catch {
                    errorText = responseText;
                }
            }
        }
        catch (error) {
            xigmaticLab.logException(error, { executionContext: 'caught' });
        }

        xigmaticLab.toastFailTT(errorText);

        return false;
    }

    async function postWithResult(url, obj) {
        url = bindUrlParameters(url);
        var token = xigmaticLab.getCsrfToken();
        let response = null;
        let responseText = '';
        let json = null;
        let error = null;

        try {
            response = await fetch(url, {
                headers: {
                    "content-type": "application/json",
                    "X-CSRF-TOKEN": token
                }, method: 'POST', body: JSON.stringify(obj)
            });

            responseText = await response.text();
            if (responseText) {
                try {
                    json = JSON.parse(responseText);
                }
                catch {
                }
            }
        }
        catch (exception) {
            xigmaticLab.logException(exception, { executionContext: 'caught' });
            error = exception;
        }

        return {
            ok: response?.ok === true,
            status: response?.status ?? 0,
            json: json,
            text: responseText,
            response: response,
            error: error
        };
    }

    function showPostError(result) {
        const errorText = result.json?.detail
            || result.json?.message
            || result.json?.title
            || result.text
            || 'Request failed';

        xigmaticLab.toastFailTT(errorText);
    }

    async function post(url, obj) {
        const result = await postWithResult(url, obj);
        if (result.ok)
            return true;

        showPostError(result);
        return false;
    }

    async function postJson(url, obj) {
        url = bindUrlParameters(url);
        var token = xigmaticLab.getCsrfToken();
        var result = await fetch(url, { method: 'POST', body: JSON.stringify(obj), headers: { "X-CSRF-TOKEN": token } });
        if (result.ok)
            return result.json();
        else
            xigmaticLab.toastFailTT('Request failed');

        return null;
    }


    async function getText(url) {
        var result = await fetch(url);
        if (result.ok)
            return result.text();
        else
            xigmaticLab.toastFailTT('Request failed');
    }

    function replaceTag(that) {
        var img = document.createElement('img');
        const id = that.getAttribute('id');
        if (id)
            img.setAttribute('id', id);

        const src = that.getAttribute('src');
        if (src)
            img.setAttribute('src', src);

        // move all elements in the other container.
        while (that.firstChild) {
            img.appendChild(that.firstChild);
        }
        that.parentNode.replaceChild(img, that);

    }

    function getTopLevelBindings(rootElement, selector) {
        return [...rootElement.querySelectorAll(selector)].filter(htmlyElement => {
            if (htmlyElement.hasAttribute('x-get-manual')) return false;
            const parentBinding = htmlyElement.parentElement?.closest('[x-get-list], [x-get-single]');
            return !parentBinding || parentBinding === rootElement || !rootElement.contains(parentBinding);
        });
    }

    function prepareListRead(element) {
        if (!element.hasAttribute('x-id')) {
            const id = uniqueId++;
            element.setAttribute('x-id', id);
            bindings[id] = element.innerHTML;
        }
        const read = {};
        bindingReads.set(element, read);
        // Hide raw templates, but keep rendered rows during a refresh (including
        // Back/Forward restores) so a failed request cannot erase a working list.
        if (!element.classList.contains('y-bound')) element.innerHTML = '';
        element.classList.add('y-binding');
        return read;
    }

    async function finishListRead(element, read) {
        try {
            const template = element.getAttribute('x-get-list');
            const data = urlRequiresIsZero(template) ? [] : await get(bindUrlParameters(template));
            if (bindingReads.get(element) !== read || data == null) return;
            element.innerHTML = bindList(bindings[element.getAttribute('x-id')], data);
            element.classList.add('y-bound');
            await window.htmly.refresh(element);
            window.permissions?.apply(element);
        } finally {
            if (bindingReads.get(element) === read) element.classList.remove('y-binding');
        }
    }

    function requiresIsZero(htmlyElement, attributeName) {
        if (!htmlyElement.hasAttribute(attributeName))
            return false;

        const requires = bindUrlParameters(
            htmlyElement.getAttribute(attributeName)
        ).trim();

        return requires === ""
            || requires === "0"
            || /\[[^\]]+\]/.test(requires);
    }

    function urlRequiresIsZero(url) {
        const urlParameters = geturlParameters(window.location.href);
        const requiredParameters = [...url.matchAll(/\[([^\]]+)\]/g)];

        return requiredParameters.some(requiredParameter => {
            const value = urlParameters[requiredParameter[1]];
            return value === undefined
                || value === null
                || value.trim() === ""
                || value === "0";
        });
    }

    window.htmly = {

        // Stateful editors control when a read is applied, so an in-flight refresh
        // cannot replace inputs before their current drafts have been captured.
        getSingle: async function (element, parameters = {}, options = {}) {
            const template = element.getAttribute('x-get-single');
            if (!template) throw new Error('Missing x-get-single binding');
            let url = bindUrlParameters(template.replace(/\[([^\]]+)\]/g, (token, key) =>
                Object.hasOwn(parameters, key) ? encodeURIComponent(parameters[key]) : token));
            if (/\[[^\]]+\]/.test(url)) throw new Error('Unresolved x-get-single parameter');
            if (options.searchParams?.toString())
                url += (url.includes('?') ? '&' : '?') + options.searchParams.toString();
            const data = await get(url, options);
            if (data != null) element.classList.add('y-bound');
            return data;
        },

        loadHtmlTemplate: function (element) {
            if (!templateLoads.has(element)) {
                const pending = getText(element.getAttribute('x-html-template')).then(html => {
                    if (html == null) throw new Error('Template could not be loaded');
                    element.innerHTML = html;
                    element.classList.remove('y-binding'); element.classList.add('y-bound');
                }).catch(error => { templateLoads.delete(element); throw error; });
                templateLoads.set(element, pending);
            }
            return templateLoads.get(element);
        },

        bindElements: function (htmlyElement, data) {
            let localUniqueId = 0;

            if (!htmlyElement.hasAttribute('x-id')) {
                localUniqueId = uniqueId++;
                htmlyElement.setAttribute('x-id', localUniqueId);
                bindings[localUniqueId] = htmlyElement.innerHTML;
            }
            else {
                localUniqueId = htmlyElement.getAttribute('x-id');
            }

            const templateHtml = bindings[localUniqueId];
            htmlyElement.innerHTML = bindList(templateHtml, data);
            htmlyElement.classList.remove('y-binding');
            htmlyElement.classList.add('y-bound');
        },

        refreshLists: async function (rootElement) {
            // Only restore table lists. Other list bindings populate editor
            // choices and may contain unsaved selections restored by the browser.
            const results = await Promise.allSettled(
                getTopLevelBindings(rootElement, '*[x-get-list]')
                    .filter(element => element.tagName === 'TBODY' && !element.closest('form'))
                    .map(element => finishListRead(element, prepareListRead(element))));
            const failed = results.find(result => result.status === 'rejected');
            if (failed) throw failed.reason;
        },

        refresh: async function (rootElement) {
            const reads = new Map();
            for (const htmlyElement of rootElement.querySelectorAll('*[x-show-requires]')) {
                if (requiresIsZero(htmlyElement, 'x-show-requires'))
                    htmlyElement.remove();
            }

            for (const htmlyElement of rootElement.querySelectorAll('*[x-html-template]')) {
                if (templateLoads.has(htmlyElement)) continue;
                const xTemplateHtml = htmlyElement.getAttribute('x-html-template');
                htmlyElement.innerHTML = xTemplateHtml.replaceAll(/{{[^}]+}}/g, '');
                htmlyElement.classList.add('y-binding');
            }

            for (const htmlyElement of getTopLevelBindings(rootElement, '*[x-get-list]')) {
                reads.set(htmlyElement, prepareListRead(htmlyElement));
            }

            for (const htmlyElement of getTopLevelBindings(rootElement, '*[x-get-single]')) {

                let localUniqueId = 0;

                if (!htmlyElement.hasAttribute('x-id')) {
                    localUniqueId = uniqueId++;
                    htmlyElement.setAttribute('x-id', localUniqueId);
                    bindings[localUniqueId] = htmlyElement.innerHTML;
                } else {
                    localUniqueId = htmlyElement.getAttribute('x-id');
                }

                const templateHtml = bindings[localUniqueId];
                const read = {};
                bindingReads.set(htmlyElement, read);
                reads.set(htmlyElement, read);
                htmlyElement.innerHTML = templateHtml.replaceAll(/{{[^}]+}}/g, '');
                htmlyElement.classList.add('y-binding');
            }

            for (const htmlyElement of rootElement.querySelectorAll('*[x-html-template]')) {
                const xTemplateHtml = htmlyElement.getAttribute('x-html-template');

                await this.loadHtmlTemplate(htmlyElement);
            }

            for (const htmlyElement of getTopLevelBindings(rootElement, '*[x-get-list]')) {
                await finishListRead(htmlyElement, reads.get(htmlyElement));
            }

            for (const htmlyElement of getTopLevelBindings(rootElement, '*[x-get-single]')) {

                let localUniqueId = htmlyElement.getAttribute('x-id');

                const templateHtml = bindings[localUniqueId];
                const xGetUrlTemplate = htmlyElement.getAttribute('x-get-single');
                const xGetUrl = bindUrlParameters(xGetUrlTemplate);
                const data = urlRequiresIsZero(xGetUrlTemplate) ? {} : await get(xGetUrl);
                if (bindingReads.get(htmlyElement) !== reads.get(htmlyElement)) continue;

                htmlyElement.innerHTML = bind(templateHtml, data);
                htmlyElement.classList.remove('y-binding');
                htmlyElement.classList.add('y-bound');
                await this.refresh(htmlyElement);
            }

            for (const htmlyElement of rootElement.querySelectorAll('*[x-delete]')) {
                const button = htmlyElement.tagName == "BUTTON" ? htmlyElement : htmlyElement.querySelector("button");
                button.addEventListener('click', async (event) => {
                    let xPostUrl = htmlyElement.getAttribute('x-delete');
                    const xConfirm = htmlyElement.getAttribute('x-confirm');
                    if (xConfirm) {
                        if (!await xigmaticLab.confirm(xConfirm))
                            return;
                    }

                    xPostUrl = xPostUrl.replace(/\[\[#(\w+)\]\]/g, (_, id) => {
                        const el = document.getElementById(id);
                        return el ? el.value : "";
                    });

                    const successUrl = htmlyElement.getAttribute('x-delete-success-url');

                    if (await deleteCall(xPostUrl)) {
                        if (htmlyElement.getAttribute('x-after-action'))
                            await eval(htmlyElement.getAttribute('x-after-action'));

                        if (successUrl)
                            window.location = successUrl;
                        else {
                            if (htmlyElement.getAttribute('x-toast') != "false")
                                xigmaticLab.toastSuccessTT("Deleted");

                            if (htmlyElement.getAttribute('x-refresh') == "true")
                                location.reload();
                        }
                    }

                });
            }

            for (const htmlyElement of rootElement.querySelectorAll('*[x-post]')) {
                const isForm = htmlyElement.tagName == "FORM";
                const actionElement = isForm
                    ? htmlyElement
                    : (htmlyElement.tagName == "BUTTON"
                        ? htmlyElement
                        : (htmlyElement.querySelector('button[type="submit"], button:not([type]), input[type="submit"]')
                            || htmlyElement.querySelector("button")));
                const actionEvent = isForm ? 'submit' : 'click';

                actionElement.addEventListener(actionEvent, async (event) => {
                    if (event.defaultPrevented)
                        return;

                    event.preventDefault();

                    let xPostUrl = htmlyElement.getAttribute('x-post');
                    const xConfirm = htmlyElement.getAttribute('x-confirm');
                    if (xConfirm) {
                        if (!await xigmaticLab.confirm(xConfirm))
                            return;
                    }

                    xPostUrl = xPostUrl.replace(/\[\[#(\w+)\]\]/g, (_, id) => {
                        const el = document.getElementById(id);
                        return el ? el.value : "";
                    });

                    const successUrl = htmlyElement.getAttribute('x-post-success-url');
                    var postObject = {};
                    [...htmlyElement.querySelectorAll('[name]')].forEach(
                        input => {
                            if (!input.name)
                                return;

                            var value = input.value;
                            if (input.type == "checkbox")
                                value = input.checked;
                            postObject[input.name] = value;
                        });

                    const result = await postWithResult(xPostUrl, postObject);
                    const json = result.json;
                    const status = result.status;
                    const response = result.response;
                    const error = result.error;

                    if (result.ok) {
                        if (htmlyElement.getAttribute('x-after-action'))
                            await eval(htmlyElement.getAttribute('x-after-action'));

                        if (successUrl)
                            window.location = successUrl;
                        else {
                            if (htmlyElement.getAttribute('x-toast') != "false")
                                xigmaticLab.toastSuccessTT("Saved");

                            if (htmlyElement.getAttribute('x-refresh') == "true")
                                location.reload();
                        }
                    }
                    else if (htmlyElement.getAttribute('x-after-error')) {
                        await eval(htmlyElement.getAttribute('x-after-error'));
                    }
                    else {
                        showPostError(result);
                    }

                });

                //htmlyElement.innerHTML = bind(templateHtml, data, null, functions);
                //htmlyElement.classList.remove('y-binding');
                //htmlyElement.classList.add('y-bound');
            }


            for (const waitImg of document.querySelectorAll('wait-img')) {
                replaceTag(waitImg);
            }

            for (const htmlyElement of rootElement.querySelectorAll('*[x-onload]')) {
                const code = htmlyElement.getAttribute('x-onload');

                if (code)
                    eval(code);
            }

        },

        post: async function (url, obj) {
            return await post(url, obj);
        },

        postWithResult: async function (url, obj) {
            return await postWithResult(url, obj);
        },

        init: function () {
            // The admin layout loads gaffa.js with defer. A fast API response
            // must not try to render before its bind/bindList functions exist.
            this.ready = document.readyState === 'loading'
                ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
                    .then(() => this.refresh(document))
                : this.refresh(document);
            return this.ready;
        },

        replaceHtmlGetSingle: async function (selector, selectorUrl) {
            htmlyElement = document.querySelector(selector);
            if (!htmlyElement) {
                console.log('htmlyElement not found by query ' + selector);
                return;
            }

            var localUniqueId = 0;
            if (!htmlyElement.attributes['x-id']) {
                localUniqueId = uniqueId++;
                htmlyElement.setAttribute('x-id', localUniqueId);
                bindings[localUniqueId] = htmlyElement.innerHTML;
            }
            else
                localUniqueId = htmlyElement.getAttribute('x-id');

            var templateHtml = bindings[localUniqueId];
            htmlyElement.innerHTML = templateHtml.replaceAll(/{{[^}]+}}/g, '');
            htmlyElement.classList.add('y-binding');

            var data = await get(selectorUrl);

            htmlyElement.innerHTML = bind(templateHtml, data);
            htmlyElement.classList.remove('y-binding');
            htmlyElement.classList.add('y-bound');
        },
    };
})();

htmly.init();
