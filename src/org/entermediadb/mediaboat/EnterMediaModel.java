package org.entermediadb.mediaboat;

import java.net.URI;
import java.util.Collection;

public class EnterMediaModel
{
	WsConnection connection;
	Configuration config = new Configuration();
	public Configuration getConfig()
	{
		return config;
	}
	protected String fieldEnterMediaKey;
	
	
	public String getEnterMediaKey()
	{
		return fieldEnterMediaKey;
	}


	public void setEnterMediaKey(String inEnterMediaKey)
	{
		fieldEnterMediaKey = inEnterMediaKey;
	}


	public WsConnection getConnection()
	{
		if (connection == null)
		{
			try
			{
				String server = getConfig().get("server");
				int i;
				if( (i  = server.indexOf("/",4)) > -1)
				{
					//strip off /s
					server = server.substring(0, i);
				}
				URI path = new URI( "ws://" + server + "/entermedia/services/websocket/org/entermediadb/websocket/mediaboat/MediaBoatConnection" );
				 // more about drafts here: http://github.com/TooTallNate/Java-WebSocket/wiki/Drafts
				connection = new WsConnection(path);
			}
			catch(Exception ex)
			{
				throw new RuntimeException(ex);
			}
		}
		return connection;
	}
	//This class will be notified when they should move files around?


	public boolean connect(String server, String inUname, String inKey)
	{
		
		String path = System.getenv("HOME");
		getConfig().put("home", path);
		getConfig().put("username", inUname);
		getConfig().put("server", server);
		getConfig().put("key", inKey);
		getConfig().save();
		//Check disk space etc?
		connection = null;
		try
		{
			log("Connecting to " + getConnection().getURI());
			boolean ok = getConnection().connectBlocking();
			if( !ok )
			{
				log("Could not connect to " + getConnection().getURI());
				return false;
			}
			log("Connected to " + getConnection().getURI());
		}
		catch (InterruptedException e)
		{
			// TODO Auto-generated catch block
			e.printStackTrace();
			log("Error connecting to " + getConnection().getURI());
			return false;
		}
		Message mes = new Message("login");
		mes.put("home",path);
		mes.put("username",inUname);
		mes.put("key",inKey);
		getConnection().send(mes);
		return true;
		
	}



	private void log(String inString)
	{
		System.out.println(inString);
	}


	public void download(String inPath, Collection inSourcepaths)
	{
		//The path is a collection path
		
		//Loop over each thing and download it
		sendStatusComplete();
	}


	public void sendStatusComplete()
	{
		//Send a message saying status 100%
		
	}
	
	//We should also upload files from the EnterMedia directory
	
	//Shuld be alerted when files are locally modified?
	
	
}
