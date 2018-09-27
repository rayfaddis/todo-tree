/* jshint esversion:6 */

Object.defineProperty( exports, "__esModule", { value: true } );

var vscode = require( 'vscode' );
var path = require( "path" );
var commentPatterns = require( 'comment-patterns' );
var utils = require( './utils.js' );
var icons = require( './icons.js' );

var elements = [];

const PATH = "path";
const TODO = "todo";

var buildCounter = 1;

class TodoDataProvider
{
    constructor( _context, defaultRootFolder )
    {
        this._context = _context;
        this.defaultRootFolder = defaultRootFolder;

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    getChildren( element )
    {
        if( !element )
        {
            var roots = elements.filter( e => e.visible );
            if( roots.length > 0 )
            {
                if( this._context.workspaceState.get( 'grouped', vscode.workspace.getConfiguration( 'todo-tree' ).get( 'grouped', false ) ) )
                {
                    roots.sort( function( a, b )
                    {
                        return a.name > b.name;
                    } );
                }
                return roots;
            }
            return [ { name: "Nothing found" } ];
        }
        else if( element.type === PATH )
        {
            if( element.elements && element.elements.length > 0 )
            {
                return element.elements.filter( e => e.visible );
            }
            else
            {
                return element.todos.filter( e => e.visible );
            }
        }
        else if( element.type === TODO )
        {
            return element.text;
        }
    }

    getParent( element )
    {
        return element.parent;
    }

    getTreeItem( element )
    {
        let treeItem = new vscode.TreeItem( element.name + ( element.pathLabel ? element.pathLabel : "" ) );

        treeItem.id = element.id;

        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;

        if( element.file )
        {
            treeItem.resourceUri = new vscode.Uri.file( element.file );
            treeItem.tooltip = element.file;

            if( element.type === PATH )
            {
                treeItem.collapsibleState = this._context.workspaceState.get( 'expanded', vscode.workspace.getConfiguration( 'todo-tree' ).get( 'expanded', false ) ) ?
                    vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;

                if( element.isRootTag )
                {
                    treeItem.iconPath = icons.getIcon( this._context, element.tag ? element.tag : element.name );
                }
                else if( element.elements && element.elements.length > 0 )
                {
                    treeItem.iconPath = vscode.ThemeIcon.Folder;
                }
                else
                {
                    treeItem.iconPath = vscode.ThemeIcon.File;
                }
            }
            else if( element.type === TODO )
            {
                treeItem.iconPath = icons.getIcon( this._context, element.tag ? element.tag : element.name );

                treeItem.command = {
                    command: "todo-tree.revealTodo",
                    title: "",
                    arguments: [
                        element.file,
                        element.line
                    ]
                };
            }
        }

        return treeItem;
    }

    clear()
    {
        utils.resetHashCache();
        elements = [];
    }

    add( entry, tagRegex )
    {
        function getRootTagElement( tag )
        {
            var findRootTag = function( e )
            {
                return e.name === this;
            };
            child = elements.find( findRootTag, tag );
            if( child === undefined )
            {
                child = {
                    isRootTag: true,
                    type: PATH,
                    name: tag,
                    tag: tag,
                    visible: true,
                    elements: [],
                    todos: [],
                    file: fullPath,
                    id: ( buildCounter * 1000000 ) + utils.hash( tag + fullPath ),
                };
                elements.push( child );
            }
            return child;
        }

        var fullPath = path.resolve( entry.folder, entry.match.file );
        var relativePath = path.relative( entry.folder, fullPath );
        var parts = relativePath.split( path.sep );

        parts.unshift( entry.rootName ? entry.rootName : entry.folder );

        var pathElement;
        var name = entry.match.match.substr( entry.match.column - 1 );

        var commentPattern;
        try
        {
            commentPattern = commentPatterns( entry.match.file );
        }
        catch( e )
        {
        }

        if( commentPattern && commentPattern.multiLineComment && commentPattern.multiLineComment.length > 0 )
        {
            commentPattern = commentPatterns.regex( entry.match.file );
            if( commentPattern && commentPattern.regex )
            {
                var commentMatch = commentPattern.regex.exec( name );
                if( commentMatch )
                {
                    for( var i = commentPattern.cg.contentStart; i < commentMatch.length; ++i )
                    {
                        if( commentMatch[ i ] )
                        {
                            name = commentMatch[ i ];
                            break;
                        }
                    }
                }
            }
        }
        var tagMatch;
        if( tagRegex )
        {
            tagMatch = tagRegex.exec( name );
            if( tagMatch )
            {
                name = name.substr( tagMatch.index );
                if( this._context.workspaceState.get( 'grouped', vscode.workspace.getConfiguration( 'todo-tree' ).get( 'grouped', false ) ) )
                {
                    name = name.substr( tagMatch[ 0 ].length );
                }
            }
        }

        var todoElement = {
            type: TODO,
            name: name,
            line: entry.match.line - 1,
            file: fullPath,
            id: ( buildCounter * 1000000 ) + utils.hash( JSON.stringify( entry.match ) ),
            visible: true
        };

        if( tagMatch )
        {
            todoElement.tag = tagMatch[ 0 ];
        }

        var flat =
            relativePath.startsWith( ".." ) ||
            entry.folder === this.defaultRootFolder ||
            this._context.workspaceState.get( 'flat', vscode.workspace.getConfiguration( 'todo-tree' ).get( 'flat', false ) );

        var parent;

        if( flat )
        {
            var findExactPath = function( e )
            {
                return e.type === PATH && e.file === this;
            };

            if( this._context.workspaceState.get( 'grouped', vscode.workspace.getConfiguration( 'todo-tree' ).get( 'grouped', false ) ) && todoElement.tag )
            {
                parent = getRootTagElement( todoElement.tag ).elements;
            }
            else
            {
                parent = elements;
            }
            var child = parent.find( findExactPath, fullPath );

            if( !child )
            {
                var folder = relativePath.startsWith( '..' ) ? path.dirname( fullPath ) : path.dirname( relativePath );
                var pathLabel = ( folder === "." ) ? "" : " (" + folder + ")";
                pathElement = {
                    type: PATH,
                    file: fullPath,
                    name: path.basename( fullPath ),
                    pathLabel: pathLabel,
                    path: relativePath,
                    elements: [],
                    todos: [],
                    id: ( buildCounter * 1000000 ) + utils.hash( fullPath ),
                    visible: true
                };

                parent.push( pathElement );
            }
            else
            {
                pathElement = child;
            }
        }
        else
        {
            var findSubPath = function( e )
            {
                return e.pathLabel === undefined && e.type === PATH && e.name === this;
            };

            if( this._context.workspaceState.get( 'grouped', vscode.workspace.getConfiguration( 'todo-tree' ).get( 'grouped', false ) ) && todoElement.tag )
            {
                parent = getRootTagElement( todoElement.tag ).elements;
            }
            else
            {
                parent = elements;
            }
            parts.map( function( p, level )
            {
                var child = parent.find( findSubPath, p );
                if( !child )
                {
                    var subPath = path.join( entry.folder, parts.slice( 0, level + 1 ).join( path.sep ) );
                    pathElement = {
                        type: PATH,
                        file: subPath,
                        name: p,
                        parent: pathElement,
                        elements: [],
                        todos: [],
                        id: ( buildCounter * 1000000 ) + utils.hash( subPath ),
                        visible: true
                    };
                    parent.push( pathElement );
                }
                else
                {
                    pathElement = child;
                }
                parent = pathElement.elements;
            } );
        }

        if( !pathElement.todos.find( element => { return element.name === todoElement.name && element.line === todoElement.line; } ) )
        {
            todoElement.parent = pathElement;
            pathElement.todos.push( todoElement );
        }
    }

    rebuild()
    {
        utils.resetHashCache();
        buildCounter = ( buildCounter + 1 ) % 100;
    }

    refresh( setViewVisibility )
    {
        this._onDidChangeTreeData.fire();
        if( setViewVisibility === true )
        {
            vscode.commands.executeCommand( 'setContext', 'todo-tree-has-content', elements.length > 0 );
        }
    }

    filter( text, children )
    {
        var matcher = new RegExp( text, vscode.workspace.getConfiguration( 'todo-tree' ).filterCaseSensitive ? "" : "i" );

        if( children === undefined )
        {
            children = elements;
        }
        children.forEach( child =>
        {
            if( child.type == TODO )
            {
                child.visible = !text || matcher.exec( child.name );
            }
            else
            {
                if( child.elements )
                {
                    this.filter( text, child.elements );
                }
                if( child.todos )
                {
                    this.filter( text, child.todos );
                }
                var visibleElements = child.elements.filter( e => e.visible ).length;
                var visibleTodos = child.todos.filter( e => e.visible ).length;
                child.visible = visibleElements + visibleTodos > 0;
            }
        } );
    }

    clearFilter( children )
    {
        if( children === undefined )
        {
            children = elements;
        }
        children.forEach( child =>
        {
            child.visible = true;
            if( child.elements )
            {
                this.clearFilter( child.elements );
            }
            if( child.todos )
            {
                this.clearFilter( child.todos );
            }
        } );
    }

    getElement( rootFolder, filename )
    {
        var element;

        var fullPath = path.resolve( rootFolder, filename );
        var relativePath = path.relative( rootFolder, fullPath );
        var parts = relativePath.split( path.sep );

        var flat =
            relativePath.startsWith( ".." ) ||
            rootFolder === this.defaultRootFolder ||
            this._context.workspaceState.get( 'flat', vscode.workspace.getConfiguration( 'todo-tree' ).get( 'flat', false ) );

        if( !this._context.workspaceState.get( 'grouped', vscode.workspace.getConfiguration( 'todo-tree' ).get( 'grouped', false ) ) )
        {
            if( flat )
            {
                var findExactPath = function( e )
                {
                    return e.type === PATH && e.file === this;
                };

                element = elements.find( findExactPath, fullPath );
            }
            else
            {
                var findSubPath = function( e )
                {
                    return e.pathLabel === undefined && e.type === PATH && e.name === this;
                };

                var parent;

                parent = elements;
                parts.map( function( p )
                {
                    var child = parent.find( findSubPath, p );
                    if( child )
                    {
                        element = child;
                    }
                    if( element )
                    {
                        parent = element.elements;
                    }
                } );
            }
        }

        return element && element.file === filename ? element : undefined;
    }
}
exports.TodoDataProvider = TodoDataProvider;
