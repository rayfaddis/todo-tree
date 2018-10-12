var vscode = require( 'vscode' );
var config = require( './config.js' );

var commentPatterns = require( 'comment-patterns' );

var usedHashes = {};

function hash( text )
{
    var hash = 0;
    if( text.length === 0 )
    {
        return hash;
    }
    for( var i = 0; i < text.length; i++ )
    {
        var char = text.charCodeAt( i );
        hash = ( ( hash << 5 ) - hash ) + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    hash = Math.abs( hash ) % 1000000;

    while( usedHashes[ hash ] !== undefined )
    {
        hash++;
    }

    usedHashes[ hash ] = true;

    return hash;
}

function resetHashCache()
{
    usedHashes = {};
}

function isHexColour( rgb )
{
    return ( typeof rgb === "string" ) && ( rgb.length === 3 || rgb.length === 6 ) && !isNaN( parseInt( rgb, 16 ) );
}

function removeBlockComments( text, fileName )
{
    var commentPattern;
    try
    {
        commentPattern = commentPatterns( fileName );
    }
    catch( e )
    {
    }

    if( commentPattern && commentPattern.multiLineComment && commentPattern.multiLineComment.length > 0 )
    {
        commentPattern = commentPatterns.regex( fileName );
        if( commentPattern && commentPattern.regex )
        {
            var commentMatch = commentPattern.regex.exec( text );
            if( commentMatch )
            {
                for( var i = commentPattern.cg.contentStart; i < commentMatch.length; ++i )
                {
                    if( commentMatch[ i ] )
                    {
                        text = commentMatch[ i ];
                        break;
                    }
                }
            }
        }
    }

    return text;
}

function extractTag( text )
{
    var c = vscode.workspace.getConfiguration( 'todo-tree' );
    var regex = c.get( 'regex' );
    var flags = c.get( 'regexCaseSensitive' ) ? '' : 'i';

    if( regex.indexOf( "$TAGS" ) > -1 )
    {
        var tagRegex = new RegExp( "(" + c.get( 'tags' ).join( "|" ) + ")", flags );

        var tagMatch = tagRegex.exec( text );
        if( tagMatch )
        {
            text = text.substr( tagMatch.index );
            if( config.shouldGroup() )
            {
                text = text.substr( tagMatch[ 0 ].length );
            }
        }
    }

    return { tag: tagMatch[ 0 ], withoutTag: text };
}

module.exports.hash = hash;
module.exports.resetHashCache = resetHashCache;
module.exports.isHexColour = isHexColour;
module.exports.removeBlockComments = removeBlockComments;
module.exports.extractTag = extractTag;