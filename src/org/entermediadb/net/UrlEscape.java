package org.entermediadb.net;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Formatter;

public class UrlEscape
{
	public static String urlEscape(String rawurl)
	{
//		gen-delims  = ":"  "/"  "?"  "#"  "["  "]" "@"
//	
//			     sub-delims  = "!" / "$" / "&" / "'" / "(" / ")"
//			                 / "*" / "+" / "," / ";" / "="
		if(rawurl  == null) {
			return null;
		}
		
//		URI uri = URI.create(rawurl);
//		String returned = uri.toExternalForm();
//		return returned;
		String host = null;
			String path = null;
			String query = null;
			if( rawurl.startsWith("/") )
			{
				path = rawurl;
			}
			else
			{
				int slash = rawurl.indexOf("/",8);
				if( slash > -1)
				{
					host = rawurl.substring(0,slash);
					path = rawurl.substring(slash);
				}
				else
				{
					path = rawurl;
				}
			}
			int quest = path.lastIndexOf("?");
			if( quest > -1)
			{
				query = path.substring(quest + 1);
				path = path.substring(0,quest);
			}
						
			path = fixPath(path);
			StringBuffer finalurl = new StringBuffer();
			if( host != null )
			{
				finalurl.append( host);
			}
			finalurl.append(path);
			if( query != null)
			{
				String[] params = query.split("&");
				StringBuffer out = new StringBuffer();
				for (int i = 0; i < params.length; i++)
				{
					String[] pair = params[i].split("=");
					if( i > 0)
					{
						out.append("&");
					}
					out.append(pair[0]);
					out.append("=");
					if( pair.length > 1)
					{
						out.append(encodeParamVal(pair[1]));
					}
				}
				finalurl.append("?" + out.toString());
			}
			return finalurl.toString();
	 }
	protected static String encodeParamVal(String value) {
	    try
		{
			return URLEncoder.encode(value, "UTF-8");
		}
		catch (UnsupportedEncodingException e)
		{
			throw new RuntimeException(e);
		}
	}

	protected static String fixPath(String inPath)
	{
		// path = UriUtils.encodePath(path, "UTF-8");
		
		//Ian says we need spaces in here
		final String PATHVALUES = ":?#[]@+ "; //:?@[] \"%-.<>\\^_`{|}~";

		
//		byte[] encoded = inPath.getBytes("UTF-8");
//		Integer.toHexString(encoded);
//		
		//Escaper 
		//String result = UrlEscapers.urlPathSegmentEscaper().escape(inPath);
	    StringBuilder result = new StringBuilder(inPath.length() +1);
	   
	    for(int i=0; i<inPath.length();++i) 
	    {
			char c = inPath.charAt(i);
			
	    	if(i < inPath.length()-1 && Character.isSurrogatePair(c, inPath.charAt(i+1))) 
	    	{
				// if so, the codepoint must be stored on a 32bit int as char is only 16bit
				int codePoint = inPath.codePointAt(i);
				// show the code point and the char
				//System.out.println(String.format("%6d:%s", codePoint, new String(new int[]{codePoint}, 0, 1)));
				byte[] allbytes = new String(new int[]{codePoint}, 0, 1).getBytes(StandardCharsets.UTF_8);
				Formatter formatter = new Formatter();
				for (byte b : allbytes) 
				{
	                formatter.format("%%%02X", b);
	            }
				result.append(formatter.toString());
				++i;
			}
	    	else if ( c > 128)
	    	{
				byte[] allbytes = new String(new int[]{c}, 0, 1).getBytes(StandardCharsets.UTF_8);
				Formatter formatter = new Formatter();
				for (byte b : allbytes) 
				{
	                formatter.format("%%%02X", b);
	            }
				result.append(formatter.toString());
	    	}
	    	else if (PATHVALUES.indexOf(c) != -1 ) 
	        { 
	            result.append("%" + Integer.toHexString(c).toUpperCase());
	        }
	        else
	        {
	        	result.append(c);
	    	}
	    }
		return result.toString();
	}
   public static String utf8encode(int codepoint) 
   {
	   	String inChar = new String(new int[]{codepoint}, 0, 1);
        byte[] bytes = inChar.getBytes(StandardCharsets.UTF_8);
        
        Formatter formatter = new Formatter();
        for (byte b : bytes) {
            formatter.format("%%02X", b);
        }
        String encodedHex = formatter.toString().toUpperCase();
        return encodedHex;
        
    }
}
