'use strict';

/**
 * Convert HTML to docx
 */

const docx = require('docx');

// Used to create docx files
const htmlparser = require('htmlparser2');
const encoder = require('html-entities').AllHtmlEntities;
const fs = require('fs');
const fsExtra = require('fs-extra');
const https = require('https');
const path = require('path');
const { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun, Media} = docx;

const _addStyles = function (params) {
    params.styles = {
        paragraphStyles: [{
            id: 'code',
            name: 'code',
            basedOn: 'Normal',
            next: 'Normal',
            run: {
                size: 24,
                font: 'Courier New'
            }
        }]
    }
    params.numbering = {
        config: [
            {
                reference: "numberLi",
                levels: [
                    {
                        level: 0,
                        text: "%1.",
                        alignment: AlignmentType.LEFT,
                    },
                    {
                        level: 1,
                        text: "%1.",
                        alignment: AlignmentType.LEFT,
                    },
                    {
                        level: 2,
                        text: "%1.",
                        alignment: AlignmentType.LEFT,
                    },
                ],
            },
        ],
    }
};

const style = {
    a: {
        color: '0680FC'
    },
    b: {
        bold: true
    },
    u: {
        underline: true
    },
    em: {
        italics: true
    },
    s: {
        strikethrough: true
    },
    colors: {
        black: '000000',
        red: 'FF0000',
        green: '008000',
        blue: '0000FF',
        yellow: 'FFFF00',
        orange: 'FFA500'
    },
    align: ['center', 'justify', 'left', 'right'],
    headings: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
};

const findItemByProperty = function (items, text, property) {
    property = property || 'name';
    if (!items) {
        return;
    }

    for (const item of items) {
        // Test current object
        if (item[property] === text) {
            return item;
        }

        // Test children recursively
        const child = findItemByProperty(item.children, text, property);
        if (child) {
            return child;
        }
    }
};

const getFilesPath = function (pathIn) {
    let pathOut = pathIn || 'files';
    if (path.basename(pathOut).indexOf('.') > -1) {
        pathOut = pathOut.replace(path.basename(pathOut), '');
    }

    return pathOut;
};

const getFileNameFromPath = function (path) {
    if (!path) {
        return null;
    }
    if (path.indexOf('data') === 0) {
        const name = path.split(';base64,').pop().substr(0, 7).replace(/\//g, '_');
        const extension = path.split(';base64,')[0].split('/')[1];

        return name + '.' + extension;
    }

    return path.split('/').pop().split('#')[0].split('?')[0];
};

const getImageFile = async function (url, dirpath) {
    const fileDirPath = getFilesPath(dirpath);

    return new Promise(function (resolve, reject) {
        return fsExtra.ensureDir(fileDirPath, {mode: '0760'}, function () {
            const filename = getFileNameFromPath(url);
            const filepath = path.join(fileDirPath, filename);

            if (url.indexOf('data') === 0) {
                const imageData = url.split(';base64,').pop();

                fs.writeFile(filepath, imageData, {encoding: 'base64'}, function (err) {
                    if (err) {
                        fs.unlink(filepath);

                        return reject(err);
                    }

                    return resolve(filepath);
                });
            } else {
                const file = fs.createWriteStream(filepath);
                url = url.replace('http', 'https');
                https.get(url, {rejectUnauthorized:false}, function (response) {
                    response.pipe(file);
                    file.on('finish', function () {
                        file.close();

                        return resolve(filepath);
                    });
                }).on('error', function (err) { // Handle errors
                    console.log(err);
                    return fs.unlink(filepath, reject(err));
                });
            }
        });
    });
};

const findItemByClass = function (item, className) {
    if (!item) {
        return;
    }
    if (item.attribs && item.attribs.class === className) {
        return item;
    }
    if (item.children) {
        for (let i = 0; i < item.children.length; i++) {
            const citem = item.children[i];
            // Test current object
            if (citem.attribs && citem.attribs.class === className) {
                return citem;
            }

            // Test children recursively
            const child = findItemByClass(citem, className);
            if (child) {
                i = item.children.length;

                return child;
            }
        }
    }


};

/**
 * @param {string} html  Html of the document
 * @param {string} title title of the docx document
 * @param {string} resPath Path where to save the docx
 * @returns {object} Html to docx object
 */
function CosHtmlToDocx (html, title, resPath) {
    this.html = html;
    this.path = resPath;
    const finalParagraphs = [];
    let params = {creator: 'citizenos.com'};
    if (title) {
        params.title = title;
    }
    _addStyles(params);
    const finalDoc = new Document(params);

    const _isElement = function (element, name) {
        if (element.type === 'tag' && element.name) {
            return element.name === name;
        }

        return false;
    }

    const _isHeadingElement = function (element) {
        if (element.name) {
            return element.name.match(/h+[0-6]/gi);
        }

        return false;
    };

    const _isAlignmentElement = function (element) {
        if (element.name) {
            return style.align.indexOf(element.name) > -1;
        }

        return false;
    };

    const _isColorElement = function (element) {
        if (element.attribs && element.attribs.class) {
            return /color:[a-z]*/gi.test(element.attribs.class);
        }

        return false;
    };

    const _isListElement = function (element) {
        return (_isElement(element, 'ul') || _isElement(element, 'ol') || _isElement(element, 'li'));
    };

    const _isTextElement = function (element) {
        if (element.type === 'text') {
            return true;
        } else if (_isElement(element, 's') ||
            _isElement(element, 'u') ||
            _isElement(element, 'em') ||
            _isElement(element, 'strong') ||
            (_isColorElement(element) || _isFontSizeElement(element))) {
            return true;
        }

        return false;
    };

    const _isParagraphElement = function (element) {
        return !_isTextElement(element);
    };

    const _isIndentListElement = function (element) {
        const item = findItemByClass(element, 'indent');

        if (item) {
            return true;
        }

        return false;
    };

    const _isBulletListElement = function (element) {
        return _isElement(element, 'ul') && element.attribs && element.attribs.class === 'bullet';
    };

    const _isFontSizeElement = function (element) {
        return element.attribs && element.attribs.class && element.attribs.class.match(/font-size/g);
    };

    const _handleHeadingAttributes = function (element, attribs) {
        if (_isHeadingElement(element)) {
            attribs.heading = HeadingLevel['HEADING_'+element.name.replace('h','')]
        }
    };

    const _handleCodeAttributes = function (element, attribs) {
        if (_isElement(element, 'code')) {
            attribs.style = 'code';
        }
    }

    const _handleAlignAttributes = function (element, attribs) {
        if (_isAlignmentElement(element)) {
            attribs.alignment = AlignmentType[element.name.toUpperCase()]
        }
    };

    const _getElementFontSizeFromStyle = function (element) {
        let size = element.attribs.class.match(/(?:font-size:)([0-9]*)?/i);
        if (size[1]) {
            size = (Math.round(size[1] * 0.75 * 2) / 2).toFixed(1); // pixels to pts

            return size * 2; // pts to half pts
        }
    };

    const _getItemDepth = function (item, depth, isList) {
        depth = depth || 0;
        if (item.parent && item.parent.name !== 'body') {
            if (!isList || (isList === true && _isListElement(item.parent) && item.parent.name !== 'li')) {
                depth++;
            }

            return _getItemDepth(item.parent, depth, isList);
        } else if (isList) {
            return depth;
        }
    };

    const _handleListElementAttributes = function (element, attribs) {
        let depth = null;
        if (_isBulletListElement(element)) {
            depth = _getItemDepth(element, null, true);
            if (!attribs.bullet)
            attribs.bullet = {level: depth};
        } else if (element.name && element.name === 'ol') {
            depth = _getItemDepth(element, null, true);
            if (!attribs.numbering)
            attribs.numbering = {reference: "numberLi", level: depth};
        } else if (_isIndentListElement(element)) {
            depth = _getItemDepth(element, null, true);
            if (!attribs.bullet)
            attribs.indent = {level: depth};
        }
    }

    const _getParagraphStyle = async function (item, attributes) {
        if (!attributes) {
            attributes = {};
        }
        _handleHeadingAttributes(item, attributes);
        _handleCodeAttributes(item, attributes);
        _handleAlignAttributes(item, attributes);
        _handleListElementAttributes(item, attributes);

        if (_isElement(item, 'img')) {
            const path = await getImageFile(item.attribs.src, resPath);
            const image = Media.addImage(finalDoc, fs.readFileSync(path));
            finalParagraphs.push(new Paragraph(image));

            return null;
        }

        if (item.parent && item.parent.name !== 'body') {
            return await _getParagraphStyle(item.parent, attributes);
        }

        return attributes;
    };

    const _getTextWithFormat = async function (item, children, attributes) {
        if (!attributes) {
            attributes = {};
        }

        if (_isColorElement(item)) {
            const colorName = item.attribs.class.split('color:')[1];
            attributes.color = style.colors[colorName];
        } else if (_isElement(item, 'strong')) {
            attributes.bold = true;
        } else if (_isElement(item, 'em')) {
            attributes.italics = true;
        } else if (_isElement(item, 'u')) {
            attributes.underline = {};
        } else if (_isElement(item, 's')) {
            attributes.strike = {};
        } else if (_isFontSizeElement(item)) {
            attributes.size = _getElementFontSizeFromStyle(item);
        }

        if (item.type === 'text') {
            const textNode = attributes;
            textNode.text = encoder.decode(item.data);
            children.push( new TextRun (textNode));
        } if (item.children) {
            for await (let gc of item.children) {
                if (!_isListElement(gc))
                    await _getTextWithFormat(gc, children, attributes);
            }
        } else {
            return attributes;
        }
    };

    const _childTagToFormat = async function (child, properties, isList) {

        await _getParagraphStyle(child, properties);
        if (child.children) {
            for await (const gchild of child.children) {
                await _getParagraphStyle(gchild, properties);
                await _getTextWithFormat(gchild, properties.children, null, isList);
            }
        }

        return properties;

    };

    const _listItems =  function (element, items) {
        items = items || [];
        if (element.children) {
            for  (const child of element.children) {
                if (_isTextElement(child) && element.name === 'li') {
                    items.push(element);

                    return items;
                } else if (_isHeadingElement(child) && element.name === 'li') {
                    items.push(child);

                    return items;
                }

                items = _listItems(child, items);
            }
        }

        return items;
    };

    const _listElementHandler = async function (element) {
        const liItems = _listItems(element);
        if (!liItems) return;
        for await (const li of liItems) {
            const children = [];
            await _getTextWithFormat(li, children);
            const paragrpahProperties = await _getParagraphStyle(li);
            paragrpahProperties.children = children

            finalParagraphs.push(new Paragraph(paragrpahProperties));

            if (li.children) {
                for await (const lic of li.children) {
                    await _listElementHandler(lic);
                }
            }
        }
    };


    /**
     * Iterates through all paragraphs and texts to return final structure and formatting of the document
     *
     * @param {array} paragraphs objects with formatting values
     *
     * @returns {Promise} Promise
     * @private
     */
    const _handleParserResult = async function (result) {
        const body = findItemByProperty(result, 'body');
        if (body && body.children) {
            for await (const tag of body.children) {
                if (_isListElement(tag)) {
                    await _listElementHandler(tag);
                }
                else if (_isParagraphElement(tag)) {
                    const paragraphProperties = await _childTagToFormat(tag, {
                        children: []
                    });
                    if (paragraphProperties)
                        finalParagraphs.push(new Paragraph(paragraphProperties))
                }
                else if (_isTextElement(tag)) {
                    const textElement = {
                        children: []
                    }
                    await _getTextWithFormat(tag, textElement.children);
                    finalParagraphs.push(new Paragraph(textElement));
                }
            }
        }
    }

    /**
     * Return docx from input html
     *
     * @param {text} [html] text
     *
     * @returns {Promise}
     *
     * @public
     */

    this.processHTML = async function (html) {
        const processHtml = this.html || html;
        return new Promise (function (resolve, reject) {
            const handler =  new htmlparser.DefaultHandler(async function (err, result) {
                if (err) {
                    return reject(err);
                }
                await _handleParserResult(result);
                finalDoc.addSection({children: finalParagraphs});
                return resolve(Buffer.from(await Packer.toBase64String(finalDoc), 'base64'));
            });
            const parser = new htmlparser.Parser(handler);
            parser.parseComplete(processHtml);
        })

    };
}


module.exports = CosHtmlToDocx;
