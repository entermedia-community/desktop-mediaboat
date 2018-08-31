package org.entermediadb.utils;

import java.io.File;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import org.apache.http.Header;
import org.apache.http.HttpEntity;
import org.apache.http.HttpResponse;
import org.apache.http.NameValuePair;
import org.apache.http.client.HttpClient;
import org.apache.http.client.config.CookieSpecs;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.entity.UrlEncodedFormEntity;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.ContentType;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.message.BasicHeader;
import org.apache.http.message.BasicNameValuePair;
import org.json.simple.JSONObject;

public class HttpSharedConnection
{
	
	Charset UTF8 = Charset.forName("UTF-8");
	ContentType textType = ContentType.create("text/plain", UTF8);
	ContentType octectType = ContentType.create("application/octect-stream", UTF8);
	ContentType jsonType = ContentType.create("application/json", UTF8);

	protected Collection fieldSharedHeaders;
	
	public Collection getSharedHeaders()
	{
		if (fieldSharedHeaders == null)
		{
			fieldSharedHeaders = new ArrayList();
		}

		return fieldSharedHeaders;
	}


	public void setSharedHeaders(Collection inSharedHeaders)
	{
		fieldSharedHeaders = inSharedHeaders;
	}

	protected HttpClient fieldHttpClient;
	
	public HttpClient getSharedClient()
	{
		if (fieldHttpClient == null)
		{
			RequestConfig globalConfig = RequestConfig.custom()
		            .setCookieSpec(CookieSpecs.DEFAULT)
		            .build();
			fieldHttpClient = HttpClients.custom()
		            .setDefaultRequestConfig(globalConfig)
		            .build();
		}

		return fieldHttpClient;
	}



	public void reset()
	{
		fieldHttpClient = null;
	}

	public HttpResponse sharedMimePost(String path, Map<String,Object> inParams)
	{
		HttpEntity entity = buildMime(inParams);
		return sharedPost(path,entity);
	}
	public HttpResponse sharedPost(String path, Map<String,String> inParams)
	{
		HttpEntity entity = buildParams(inParams);
		return sharedPost(path,entity);
	}

	public HttpResponse sharedGet(String inUrl)
	{
		try
		{
			HttpGet method = new HttpGet(inUrl);
			HttpResponse response2 = getSharedClient().execute(method);
			return response2;
		}
		catch ( Exception ex )
		{
			throw new RuntimeException(ex);
		}
	}
	protected HttpEntity buildMime(Map <String, Object> inMap)
	{
		HttpMimeBuilder builder = new HttpMimeBuilder();

		for (Iterator iterator = inMap.keySet().iterator(); iterator.hasNext();)
		{
			String key = (String) iterator.next();
			Object value = inMap.get(key);
			if( value instanceof String)
			{
				builder.addPart(key, (String)value);
			}
			else if(value instanceof File)
			{
				builder.addPart(key, (File)value);
			}
			else if( value instanceof JSONObject)
			{
				builder.addPart(key, ((JSONObject) value).toJSONString(), "application/json" );
			}
			
		}
		return builder.build();
	}

	
	protected HttpEntity buildParams(Map <String, String> inMap){
		
		List<NameValuePair> nameValuePairs = new ArrayList<NameValuePair>();

		for (Iterator iterator = inMap.keySet().iterator(); iterator.hasNext();)
		{
			String key = (String) iterator.next();
			String val = inMap.get(key);
			  nameValuePairs.add(new BasicNameValuePair(key, val));

			
		}
		 return new UrlEncodedFormEntity(nameValuePairs, UTF8);

		
		
	}

	public HttpResponse sharedPost(String path,HttpEntity inBuild)
	{
		try
		{
			HttpPost method = makePost(path);
			method.setEntity(inBuild);
			HttpResponse response2 = getSharedClient().execute(method);
			return response2;
		}
		catch ( Exception ex )
		{
			throw new RuntimeException(ex);
		}
	}


	private URI makeUri(String path) throws URISyntaxException
	{
//		int serverindex = path.indexOf("/",9);
//		String server = path.substring(0,serverindex);
//		String finalPartOfString = path.substring(serverindex);
		try
		{
			//URIBuilder ub = new URIBuilder(path);
			String url = urlEscape(path);
			URI uri = new URI(url);
			return uri;

//			String encoded = java.net.URLEncoder.encode(finalPartOfString, "utf-8");
//			return new URI(server + encoded);
		} catch ( Exception ex)
		{
			throw new RuntimeException("Could not encode url ", ex);
		}
	}

	public HttpResponse sharedPost(String path,JSONObject inObject)
	{
		try
		{
			HttpPost method = makePost(path);
			method.setHeader("Content-type", "application/json");
			StringEntity body = new StringEntity(inObject.toJSONString(), UTF8);
			method.setEntity(body);
			HttpResponse response2 = getSharedClient().execute(method);
			return response2;
		}
		catch ( Exception ex )
		{
			throw new RuntimeException(ex);
		}
	}


	protected HttpPost makePost(String path) throws URISyntaxException
	{
		HttpPost method = new HttpPost(makeUri(path));
		for (Iterator iterator = getSharedHeaders().iterator(); iterator.hasNext();)
		{
			Header header =  (Header)iterator.next();
			method.addHeader(header);
		}
		return method;
	}
	public void addSharedHeader(String inType, String inVal)
	{
		BasicHeader header = new BasicHeader(inType, inVal);
		getSharedHeaders().add(header);
	}
	public static String urlEscape(String completeurl)
	{
//		gen-delims  = ":"  "/"  "?"  "#"  "["  "]" "@"
//	
//			     sub-delims  = "!" / "$" / "&" / "'" / "(" / ")"
//			                 / "*" / "+" / "," / ";" / "="
		final String PATHVALUES = "!$&'()*+,;= "; //:?@[] \"%-.<>\\^_`{|}~";
		
		String http = null;
		String urlpath = null;
		String parameters = null;
		if( completeurl.startsWith("/") )
		{
			urlpath = completeurl;
		}
		else
		{
			int slash = completeurl.indexOf("/",7);
			http = completeurl.substring(0,slash);
			urlpath = completeurl.substring(slash);
		}
		int quest = urlpath.indexOf("?");
		if( quest > -1)
		{
			parameters = urlpath.substring(quest);
			urlpath = urlpath.substring(0,quest);
		}
		
	    StringBuilder result = new StringBuilder(urlpath);
	    for (int i = urlpath.length() - 1; i >= 0; i--) {
	        if (PATHVALUES.indexOf(urlpath.charAt(i)) != -1) {
	            result.replace(i, i + 1, 
	                    "%" + Integer.toHexString(urlpath.charAt(i)).toUpperCase());
	        }
	    }
	    String finalurl = "";
	    if( http != null)
	    {
	    	finalurl = http;
	    }
	    finalurl = finalurl + result.toString();
	    if( parameters != null)
	    {
	    	finalurl = finalurl + parameters;
	    }
	    return finalurl;
	}
	
	
}
